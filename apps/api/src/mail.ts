import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { lookup } from 'node:dns/promises';
import { z } from 'zod';

export interface VerificationMail {
  id: string;
  to: string;
  code: string;
  expiresAt: string;
}
export interface StudentMailer {
  mode: 'local-test' | 'smtp';
  configured(): Promise<boolean>;
  send(mail: VerificationMail): Promise<void>;
  verify?(): Promise<void>;
}
export function localTestMailer(directory: string): StudentMailer {
  return {
    mode: 'local-test',
    configured: async () => Boolean(directory),
    async send(mail) {
      if (!mail.to.endsWith('@students.example.test')) throw new Error('TEST_EMAIL_REQUIRED');
      await mkdir(directory, { recursive: true });
      await writeFile(
        path.join(directory, `${mail.id}.json`),
        JSON.stringify({ ...mail, notice: 'LOCAL TEST MAILBOX — no email was sent' }, null, 2),
        { mode: 0o600 },
      );
    },
  };
}
const email = z.string().email().max(254);
export function createStudentMailer(
  env: Record<string, string | undefined> = process.env,
): StudentMailer | undefined {
  const mode = env.EMAIL_DELIVERY ?? 'local-test';
  if (mode === 'local-test')
    return env.STUDENT_MAIL_DIRECTORY ? localTestMailer(env.STUDENT_MAIL_DIRECTORY) : undefined;
  if (mode !== 'smtp') throw new Error('EMAIL_DELIVERY must be local-test or smtp');
  async function settings() {
    const host = env.SMTP_HOST?.trim();
    const port = Number(env.SMTP_PORT ?? 465);
    const user = env.SMTP_USER?.trim();
    const from = env.SMTP_FROM?.trim();
    let pass = env.SMTP_PASSWORD;
    if (env.SMTP_PASSWORD_FILE) {
      try {
        pass = await readFile(env.SMTP_PASSWORD_FILE, 'utf8');
      } catch {
        return undefined;
      }
    }
    pass = pass?.trim();
    if (host === 'smtp.gmail.com') pass = pass?.replace(/\s/g, '');
    if (
      !host ||
      /[\s/:]/.test(host) ||
      ![465, 587].includes(port) ||
      !user ||
      !email.safeParse(from).success ||
      !pass
    )
      return undefined;
    return { host, port, user, from: from!, pass };
  }
  async function smtp() {
    const s = await settings();
    if (!s) throw new Error('EMAIL_SERVICE_NOT_CONFIGURED');
    // Use the OS resolver (also works on networks that block direct DNS queries).
    // Preserve the original hostname for SNI and strict certificate verification.
    const resolved = await lookup(s.host, { family: 4 });
    const transport = nodemailer.createTransport({
      host: resolved.address,
      servername: s.host,
      port: s.port,
      secure: s.port === 465,
      requireTLS: true,
      auth: { user: s.user, pass: s.pass },
      tls: { servername: s.host, minVersion: 'TLSv1.2', rejectUnauthorized: true },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
      logger: false,
      debug: false,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    return { s, transport };
  }
  return {
    mode: 'smtp',
    configured: async () => Boolean(await settings()),
    async verify() {
      const { transport } = await smtp();
      try {
        await transport.verify();
      } finally {
        transport.close();
      }
    },
    async send(mail) {
      const to = email.parse(mail.to);
      // SMTP mode has no filesystem-code fallback and never accepts sample domains.
      if (to.endsWith('.test')) throw new Error('REAL_EMAIL_REQUIRED');
      const { s, transport } = await smtp();
      try {
        const result = await transport.sendMail({
          from: { name: 'ProofPass', address: s.from },
          to: { address: to, name: '' },
          subject: 'Your ProofPass verification code',
          text: `Your ProofPass verification code is: ${mail.code}\n\nIt expires in 10 minutes and can be used once to issue your student credential.\n\nRequest: ${mail.id}\nIf you did not request this code, ignore this email.\n\nProofPass is a college demonstration; this message does not confirm real college enrollment.`,
        });
        if (!result.accepted?.some((v) => String(v).toLowerCase() === to.toLowerCase()))
          throw new Error('RECIPIENT_NOT_ACCEPTED');
      } finally {
        transport.close();
      }
    },
  };
}
