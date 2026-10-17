import { it, expect, vi, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createStudentMailer, localTestMailer } from '../apps/api/src/mail';
import nodemailer from 'nodemailer';
vi.mock('nodemailer', () => ({ default: { createTransport: vi.fn() } }));
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async () => ({ address: '203.0.113.1', family: 4 })),
}));
afterEach(() => vi.clearAllMocks());
const mail = {
  id: '00000000-0000-0000-0000-000000000001',
  to: 'student@example.com',
  code: '123456',
  expiresAt: new Date(Date.now() + 600000).toISOString(),
};
const env = {
  EMAIL_DELIVERY: 'smtp',
  SMTP_HOST: 'smtp.gmail.com',
  SMTP_PORT: '465',
  SMTP_USER: 'sender@example.com',
  SMTP_FROM: 'sender@example.com',
  SMTP_PASSWORD: 'aaaa bbbb cccc dddd',
};
it('requires complete SMTP settings and never silently switches to local delivery', async () => {
  for (const change of [
    { SMTP_PASSWORD: '' },
    { SMTP_FROM: 'bad\r\nBcc:attacker@example.com' },
    { SMTP_PORT: '25' },
    { SMTP_PASSWORD_FILE: '.local/missing-mail-password-test' },
  ]) {
    const sender = createStudentMailer({ ...env, ...change })!;
    expect(sender.mode).toBe('smtp');
    expect(await sender.configured()).toBe(false);
  }
  expect(() => createStudentMailer({ EMAIL_DELIVERY: 'mistyped' })).toThrow();
});
it('sends a code only to one recipient using TLS and does not include private enrollment fields', async () => {
  const sendMail = vi.fn(async (_message: Record<string, unknown>) => ({ accepted: [mail.to] }));
  const close = vi.fn();
  const verify = vi.fn();
  vi.mocked(nodemailer.createTransport).mockReturnValue({ sendMail, close, verify } as never);
  const sender = createStudentMailer(env)!;
  expect(await sender.configured()).toBe(true);
  await sender.send(mail);
  const options = vi.mocked(nodemailer.createTransport).mock.calls[0][0] as Record<string, unknown>;
  expect(options).toMatchObject({
    host: '203.0.113.1',
    servername: 'smtp.gmail.com',
    port: 465,
    secure: true,
    requireTLS: true,
    logger: false,
    debug: false,
    disableFileAccess: true,
    disableUrlAccess: true,
    tls: { servername: 'smtp.gmail.com', minVersion: 'TLSv1.2', rejectUnauthorized: true },
    auth: { user: env.SMTP_USER, pass: 'aaaabbbbccccdddd' },
  });
  const message = sendMail.mock.calls[0][0] as unknown as Record<string, unknown>;
  expect(message.to).toEqual({ address: mail.to, name: '' });
  expect(message.text).toContain(mail.code);
  expect(JSON.stringify(message)).not.toMatch(/"roll"|"secret"|"wallet"|cardExpiry|dateOfBirth/);
  expect(close).toHaveBeenCalledOnce();
  await sender.verify!();
  expect(verify).toHaveBeenCalledOnce();
});
it('treats rejected recipients as failed delivery and closes SMTP transport', async () => {
  const close = vi.fn();
  vi.mocked(nodemailer.createTransport).mockReturnValue({
    sendMail: async () => ({ accepted: [] }),
    close,
  } as never);
  await expect(createStudentMailer(env)!.send(mail)).rejects.toThrow('RECIPIENT_NOT_ACCEPTED');
  expect(close).toHaveBeenCalledOnce();
});
it('reads passwords from a local file without saving SMTP codes to disk', async () => {
  const dir = await mkdtemp(path.resolve('.local/mail-unit-'));
  try {
    const passwordFile = path.join(dir, 'password.txt');
    await writeFile(passwordFile, 'aaaa bbbb cccc dddd');
    const sender = createStudentMailer({
      ...env,
      SMTP_PASSWORD: '',
      SMTP_PASSWORD_FILE: passwordFile,
    })!;
    expect(await sender.configured()).toBe(true);
    const sendMail = vi.fn(async () => ({ accepted: [mail.to] }));
    vi.mocked(nodemailer.createTransport).mockReturnValue({ sendMail, close: vi.fn() } as never);
    await sender.send(mail);
    await expect(readFile(path.join(dir, mail.id + '.json'))).rejects.toThrow();
    await expect(sender.send({ ...mail, to: 'student@students.example.test' })).rejects.toThrow(
      'REAL_EMAIL_REQUIRED',
    );
    await expect(localTestMailer(dir).send(mail)).rejects.toThrow('TEST_EMAIL_REQUIRED');
  } finally {
    if (
      path.dirname(dir) !== path.resolve('.local') ||
      !path.basename(dir).startsWith('mail-unit-')
    )
      throw new Error('Invalid test path');
    await rm(dir, { recursive: true, force: true });
  }
});
