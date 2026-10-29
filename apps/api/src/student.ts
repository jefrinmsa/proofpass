import {
  randomUUID,
  randomInt,
  createHmac,
  randomBytes,
  createHash,
  timingSafeEqual,
} from 'node:crypto';
import type pg from 'pg';
import type { FastifyInstance } from 'fastify';
import { verifyMessage, type Address } from 'viem';
import { z } from 'zod';
import {
  studentProofSchema,
  studentMessage,
  studentSignal,
  scalar,
  address,
  STUDENT_POLICY,
  type StudentChallenge,
  type StudentProof,
} from '@zk-auth/shared';
import { studentCrypto } from '../../../packages/shared/src/student-crypto.js';
import { PgStore } from './store.js';
import { AuthError } from './service.js';
import { localTestMailer, type StudentMailer } from './mail.js';

export interface StudentDependencies {
  db: pg.Pool;
  chainId: number;
  verifier: Address;
  getRoot(): Promise<string>;
  setRoot(root: string): Promise<void>;
  verifyProof(proof: StudentProof): Promise<boolean>;
  signAssertion(claims: Record<string, unknown>): Promise<string>;
  mailDirectory?: string;
  mailer?: StudentMailer;
  otpHashSecret?: string;
  now?: () => number;
}
export function studentService(d: StudentDependencies) {
  const now = d.now ?? Date.now;
  const store = new PgStore(d.db);
  const mailer = d.mailer ?? (d.mailDirectory ? localTestMailer(d.mailDirectory) : undefined);
  if (d.otpHashSecret && !/^[a-fA-F0-9]{64}$/.test(d.otpHashSecret))
    throw new Error(
      'OTP_HASH_SECRET must contain 32 random bytes encoded as 64 hexadecimal characters',
    );
  const pepper = d.otpHashSecret ? Buffer.from(d.otpHashSecret, 'hex') : randomBytes(32);
  const codeHash = (id: string, code: string) =>
    createHmac('sha256', pepper).update(`${id}:${code}`).digest('hex');
  async function registry(db: Pick<pg.Pool, 'query'> = d.db) {
    // Expiry is checked inside the proof. Revocations remove leaves from this approved set.
    const rows = await db.query(
      'SELECT c.leaf FROM student_credentials c JOIN student_enrollments e USING(roll) WHERE e.active=true AND c.expires_at=e.expires_at ORDER BY c.roll',
    );
    const leaves = rows.rows.map((r) => r.leaf as string);
    const { tree } = await studentCrypto();
    return { leaves, root: tree(leaves).root };
  }
  async function current() {
    const snapshot = await registry();
    if ((await d.getRoot()) !== snapshot.root) throw new AuthError('REGISTRY_UNAVAILABLE', 503);
    return snapshot;
  }
  async function allowed(appId: string, origin: string) {
    const app = await store.getApp(appId);
    if (!app?.origins.includes(origin)) throw new AuthError('ORIGIN_NOT_ALLOWED', 403);
    return app;
  }
  return {
    async config() {
      return {
        emailMode: mailer?.mode ?? 'disabled',
        emailConfigured: (await mailer?.configured()) ?? false,
      };
    },
    registry: current,
    async request(
      b: {
        appId: string;
        roll: string;
        expiry: number;
        email: string;
        wallet: Address;
        secretCommitment: string;
      },
      origin: string,
    ) {
      await allowed(b.appId, origin);
      if (!mailer || !(await mailer.configured()))
        throw new AuthError('EMAIL_SERVICE_NOT_CONFIGURED', 503);
      const e = (await d.db.query('SELECT * FROM student_enrollments WHERE roll=$1', [b.roll]))
        .rows[0];
      if (
        !e?.active ||
        e.email !== b.email ||
        Number(e.expires_at) !== b.expiry ||
        b.expiry * 1000 <= now()
      )
        throw new AuthError('ENROLLMENT_NOT_VERIFIED', 403);
      if (mailer.mode === 'local-test' && !b.email.endsWith('@students.example.test'))
        throw new AuthError('TEST_EMAIL_REQUIRED', 403);
      if (mailer.mode === 'smtp' && b.email.endsWith('.test'))
        throw new AuthError('REAL_EMAIL_REQUIRED', 403);
      const id = randomUUID();
      const code = String(randomInt(100000, 1000000));
      const expiresAt = new Date(now() + 600000).toISOString();
      const payload = { ...b, origin, expiresAt, nonce: randomBytes(32).toString('hex') };
      const message =
        'ProofPass student credential issuance v1\n' + JSON.stringify({ id, ...payload });
      const conn = await d.db.connect();
      try {
        await conn.query('BEGIN');
        await conn.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          `student-email:${b.email}`,
        ]);
        const recent = await conn.query(
          "SELECT count(*)::int AS count FROM student_email_challenges WHERE payload->>'email'=$1 AND expires_at>NOW()-INTERVAL '5 minutes'",
          [b.email],
        );
        if (recent.rows[0].count >= 5) throw new AuthError('EMAIL_RATE_LIMITED', 429);
        await conn.query(
          'INSERT INTO student_email_challenges(id,payload,code_hash,expires_at) VALUES($1,$2,$3,$4)',
          [id, { ...payload, message }, codeHash(id, code), expiresAt],
        );
        await conn.query('COMMIT');
      } catch (e) {
        await conn.query('ROLLBACK');
        throw e;
      } finally {
        conn.release();
      }
      try {
        await mailer.send({ id, to: e.email, code, expiresAt });
      } catch {
        // A failed or ambiguous send must not leave a usable issuance request.
        await d.db.query('UPDATE student_email_challenges SET consumed_at=NOW() WHERE id=$1', [id]);
        throw new AuthError('EMAIL_DELIVERY_FAILED', 503);
      }
      return {
        id,
        message,
        expiresAt,
        emailMode: mailer.mode,
        notice:
          mailer.mode === 'smtp'
            ? 'Code submitted to your registered email. Check Inbox and Spam.'
            : 'No email sent. Read this request’s code using the student:mail administrator CLI.',
      };
    },
    async issue(id: string, code: string, signature: `0x${string}`, origin: string) {
      // Count failed attempts atomically and before any signature/proof work.
      const pending = await d.db.query(
        'UPDATE student_email_challenges SET attempts=attempts+1 WHERE id=$1 AND consumed_at IS NULL AND expires_at>NOW() AND attempts<5 RETURNING payload,code_hash',
        [id],
      );
      const row = pending.rows[0];
      if (!row) throw new AuthError('EMAIL_CODE_EXPIRED_OR_LOCKED', 401);
      if (
        !timingSafeEqual(Buffer.from(row.code_hash, 'hex'), Buffer.from(codeHash(id, code), 'hex'))
      )
        throw new AuthError('INVALID_EMAIL_CODE', 401);
      const p = row.payload;
      await allowed(p.appId, origin);
      if (
        p.origin !== origin ||
        !(await verifyMessage({ address: p.wallet, message: p.message, signature }).catch(
          () => false,
        ))
      )
        throw new AuthError('WALLET_MISMATCH', 401);
      const conn = await d.db.connect();
      try {
        await conn.query('BEGIN');
        await conn.query('SELECT pg_advisory_xact_lock(7342091)');
        const consumed = await conn.query(
          'UPDATE student_email_challenges SET consumed_at=NOW() WHERE id=$1 AND consumed_at IS NULL AND expires_at>NOW() RETURNING id',
          [id],
        );
        if (!consumed.rowCount) throw new AuthError('EMAIL_CODE_ALREADY_USED', 409);
        const e = (
          await conn.query('SELECT * FROM student_enrollments WHERE roll=$1 FOR UPDATE', [p.roll])
        ).rows[0];
        if (
          !e?.active ||
          e.email !== p.email ||
          Number(e.expires_at) !== p.expiry ||
          p.expiry * 1000 <= now()
        )
          throw new AuthError('ENROLLMENT_NOT_VERIFIED', 403);
        const { leaf } = await studentCrypto();
        const commitment = leaf(p.roll, p.expiry, p.wallet, p.secretCommitment);
        await conn.query(
          'INSERT INTO student_credentials(roll,leaf,wallet,expires_at) VALUES($1,$2,$3,$4) ON CONFLICT(roll) DO UPDATE SET leaf=$2,wallet=$3,expires_at=$4,created_at=NOW()',
          [p.roll, commitment, p.wallet, p.expiry],
        );
        const snapshot = await registry(conn);
        await d.setRoot(snapshot.root);
        await conn.query('COMMIT');
        return { issued: true, root: snapshot.root };
      } catch (e) {
        await conn.query('ROLLBACK');
        throw e;
      } finally {
        conn.release();
      }
    },
    async challenge(appId: string, origin: string, wallet: Address) {
      const app = await allowed(appId, origin);
      const { root } = await current();
      const fields = {
        id: randomUUID(),
        appId,
        origin,
        wallet,
        chainId: d.chainId,
        verifier: d.verifier,
        root,
        scope: app.nullifierSeed,
        validUntil: Math.floor(now() / 1000) + 28800,
        expiresAt: new Date(now() + 300000).toISOString(),
        nonce: randomBytes(32).toString('hex'),
      };
      const message = studentMessage(fields);
      const c = { ...fields, message, signal: studentSignal(message) };
      await d.db.query('INSERT INTO challenges(id,payload,expires_at) VALUES($1,$2,$3)', [
        c.id,
        c,
        c.expiresAt,
      ]);
      return c;
    },
    async verify(id: string, origin: string, signature: `0x${string}`, proof: StudentProof) {
      const c = (await d.db.query('SELECT payload FROM challenges WHERE id=$1', [id])).rows[0]
        ?.payload as StudentChallenge | undefined;
      if (!c?.root) throw new AuthError('CHALLENGE_NOT_FOUND', 404);
      if (Date.parse(c.expiresAt) <= now()) throw new AuthError('CHALLENGE_EXPIRED');
      const app = await allowed(c.appId, origin);
      if (c.origin !== origin) throw new AuthError('ORIGIN_NOT_ALLOWED', 403);
      if (c.chainId !== d.chainId || c.verifier !== d.verifier)
        throw new AuthError('WRONG_NETWORK');
      const s = proof.publicSignals;
      if (
        s[2] !== c.root ||
        s[3] !== c.scope ||
        s[3] !== app.nullifierSeed ||
        s[4] !== BigInt(c.wallet).toString() ||
        s[5] !== String(c.validUntil) ||
        s[6] !== c.signal
      )
        throw new AuthError('PROOF_CONTEXT_MISMATCH', 401);
      if (
        !(await verifyMessage({ address: c.wallet, message: c.message, signature }).catch(
          () => false,
        ))
      )
        throw new AuthError('WALLET_MISMATCH', 401);
      let valid = false;
      try {
        if ((await current()).root !== c.root) throw new AuthError('REGISTRY_CHANGED', 409);
        valid = await d.verifyProof(proof);
      } catch (e) {
        if (e instanceof AuthError) throw e;
        throw new AuthError('VERIFICATION_UNAVAILABLE', 503);
      }
      if (!valid) throw new AuthError('INVALID_PROOF', 401);
      const assertion = await d.signAssertion({
        aud: c.appId,
        sub: createHash('sha256').update(`${c.appId}:${s[0]}`).digest('hex'),
        wallet: c.wallet,
        studentEnrolled: true,
        credentialPolicy: STUDENT_POLICY,
        registryRoot: c.root,
        accessUntil: c.validUntil,
        environment: 'test',
        jti: randomUUID(),
      });
      if (!(await store.consumeChallenge(id)))
        throw new AuthError('CHALLENGE_USED_OR_EXPIRED', 409);
      return { assertion, expiresIn: 300, environment: 'test' };
    },
  };
}
export function registerStudentRoutes(server: FastifyInstance, d: StudentDependencies) {
  const s = studentService(d);
  const origin = (r: { headers: { origin?: string } }) => r.headers.origin ?? '';
  const sig = z
    .string()
    .regex(/^0x[0-9a-fA-F]+$/)
    .max(2048);
  const app = z.string().min(1).max(64);
  server.get('/v1/student/config', () => s.config());
  server.get('/v1/student/registry', () => s.registry());
  server.post(
    '/v1/student/enrollment/request',
    { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } },
    (r) => {
      const b = z
        .object({
          appId: app,
          roll: z.string().regex(/^[A-Z0-9-]{3,40}$/),
          expiry: z.number().int().positive().max(4102444800),
          email: z
            .string()
            .email()
            .max(254)
            .transform((v) => v.toLowerCase()),
          wallet: address,
          secretCommitment: scalar,
        })
        .strict()
        .parse(r.body);
      return s.request(b, origin(r));
    },
  );
  server.post('/v1/student/enrollment/confirm', (r) => {
    const b = z
      .object({ id: z.string().uuid(), code: z.string().regex(/^\d{6}$/), signature: sig })
      .strict()
      .parse(r.body);
    return s.issue(b.id, b.code, b.signature as `0x${string}`, origin(r));
  });
  server.post('/v1/student/challenges', (r) => {
    const b = z.object({ appId: app, wallet: address }).strict().parse(r.body);
    return s.challenge(b.appId, origin(r), b.wallet);
  });
  server.post('/v1/student/auth/verify', (r) => {
    const b = z
      .object({ challengeId: z.string().uuid(), signature: sig, proof: studentProofSchema })
      .strict()
      .parse(r.body);
    return s.verify(b.challengeId, origin(r), b.signature as `0x${string}`, b.proof);
  });
  return s;
}
