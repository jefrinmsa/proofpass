import { it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import type pg from 'pg';
import { privateKeyToAccount } from 'viem/accounts';
import { studentService } from '../apps/api/src/student';
import { studentCrypto } from '../packages/shared/src/student-crypto';
import type { StudentProof } from '@zk-auth/shared';
import type { VerificationMail } from '../apps/api/src/mail';

it('authorizes student issuance and rejects enrollment, email, wallet, replay and registry failures', async () => {
  const db = new PGlite();
  await db.exec(await readFile('scripts/schema.sql', 'utf8'));
  const query = async (sql: string, values?: unknown[]) => {
    // PGlite has one connection. Production's PostgreSQL advisory lock serializes registry writers.
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [], rowCount: 0 };
    const r = await db.query(sql, values);
    return { ...r, rowCount: r.affectedRows ?? r.rows.length };
  };
  const adapter = { query, connect: async () => ({ query, release() {} }) } as unknown as pg.Pool;
  await mkdir('.local', { recursive: true });
  const directory = await mkdtemp(path.resolve('.local/student-mail-test-'));
  const account = privateKeyToAccount(('0x' + '11'.repeat(32)) as `0x${string}`);
  const other = privateKeyToAccount(('0x' + '22'.repeat(32)) as `0x${string}`);
  const { tree, hash } = await studentCrypto();
  let root = tree([]).root;
  let proofValid = true;
  let outage = false;
  let signed = 0;
  const deps = {
    db: adapter,
    chainId: 31337,
    verifier: ('0x' + 'ab'.repeat(20)) as `0x${string}`,
    getRoot: async () => {
      if (outage) throw new Error('offline');
      return root;
    },
    setRoot: async (v: string) => {
      root = v;
    },
    verifyProof: async () => proofValid,
    signAssertion: async (claims: Record<string, unknown>) => {
      signed++;
      return JSON.stringify(claims);
    },
    mailDirectory: directory,
  };
  const service = studentService(deps);
  const origin = 'http://localhost:3001';
  const expiry = Math.floor(Date.now() / 1000) + 864000;
  const body = {
    appId: 'demo-b',
    roll: 'CSE2026001',
    expiry,
    email: 'student1@students.example.test',
    wallet: account.address,
    secretCommitment: hash(['12345']),
  };
  try {
    await query('INSERT INTO applications(id,origins,nullifier_seed) VALUES($1,$2,$3)', [
      'demo-b',
      JSON.stringify([origin]),
      '456',
    ]);
    await query(
      'INSERT INTO student_enrollments(roll,email,expires_at,active) VALUES($1,$2,$3,true)',
      [body.roll, body.email, expiry],
    );
    await query(
      'INSERT INTO student_enrollments(roll,email,expires_at,active) VALUES($1,$2,$3,true)',
      ['EXPIRED', 'expired@students.example.test', 1],
    );
    await expect(
      service.request(
        { ...body, roll: 'EXPIRED', email: 'expired@students.example.test', expiry: 1 },
        origin,
      ),
    ).rejects.toThrow('ENROLLMENT_NOT_VERIFIED');
    for (const alteration of [
      { roll: 'UNKNOWN' },
      { email: 'someone@students.example.test' },
      { expiry: expiry + 1 },
    ])
      await expect(service.request({ ...body, ...alteration }, origin)).rejects.toThrow(
        'ENROLLMENT_NOT_VERIFIED',
      );
    await expect(service.request(body, 'http://attacker.test')).rejects.toThrow(
      'ORIGIN_NOT_ALLOWED',
    );
    await expect(
      studentService({ ...deps, mailDirectory: undefined }).request(body, origin),
    ).rejects.toThrow('EMAIL_SERVICE_NOT_CONFIGURED');
    const pending = await service.request(body, origin);
    const mail = JSON.parse(await readFile(path.join(directory, `${pending.id}.json`), 'utf8'));
    const sig = await account.signMessage({ message: pending.message });
    await expect(service.issue(pending.id, '000000', sig, origin)).rejects.toThrow(
      'INVALID_EMAIL_CODE',
    );
    await expect(
      service.issue(
        pending.id,
        mail.code,
        await other.signMessage({ message: pending.message }),
        origin,
      ),
    ).rejects.toThrow('WALLET_MISMATCH');
    await service.issue(pending.id, mail.code, sig, origin);
    await expect(service.issue(pending.id, mail.code, sig, origin)).rejects.toThrow(
      'EMAIL_CODE_EXPIRED_OR_LOCKED',
    );
    expect((await service.registry()).leaves).toHaveLength(1);
    const locked = await service.request(body, origin);
    for (let i = 0; i < 5; i++)
      await expect(service.issue(locked.id, '000000', sig, origin)).rejects.toThrow(
        'INVALID_EMAIL_CODE',
      );
    await expect(service.issue(locked.id, '000000', sig, origin)).rejects.toThrow(
      'EMAIL_CODE_EXPIRED_OR_LOCKED',
    );
    const expired = await service.request(body, origin);
    await query(
      "UPDATE student_email_challenges SET expires_at=NOW()-INTERVAL '1 minute' WHERE id=$1",
      [expired.id],
    );
    await expect(service.issue(expired.id, '000000', sig, origin)).rejects.toThrow(
      'EMAIL_CODE_EXPIRED_OR_LOCKED',
    );
    const c = await service.challenge('demo-b', origin, account.address);
    const signature = await account.signMessage({ message: c.message });
    const proof: StudentProof = {
      publicSignals: [
        '1',
        '2',
        root,
        '456',
        BigInt(account.address).toString(),
        String(c.validUntil),
        c.signal,
      ],
      groth16: Array(8).fill('0'),
    };
    for (const i of [2, 3, 4, 5, 6]) {
      const changed = structuredClone(proof);
      changed.publicSignals[i] = '999';
      await expect(service.verify(c.id, origin, signature, changed)).rejects.toThrow(
        'PROOF_CONTEXT_MISMATCH',
      );
    }
    await expect(
      service.verify(c.id, origin, await other.signMessage({ message: c.message }), proof),
    ).rejects.toThrow('WALLET_MISMATCH');
    proofValid = false;
    await expect(service.verify(c.id, origin, signature, proof)).rejects.toThrow('INVALID_PROOF');
    proofValid = true;
    outage = true;
    await expect(service.verify(c.id, origin, signature, proof)).rejects.toThrow(
      'VERIFICATION_UNAVAILABLE',
    );
    outage = false;
    expect(signed).toBe(0);
    const result = await Promise.allSettled([
      service.verify(c.id, origin, signature, proof),
      service.verify(c.id, origin, signature, proof),
    ]);
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    await expect(service.verify(c.id, origin, signature, proof)).rejects.toThrow(
      'CHALLENGE_USED_OR_EXPIRED',
    );
    const claims = JSON.parse(result.find((r) => r.status === 'fulfilled')!.value.assertion);
    expect(claims.studentEnrolled).toBe(true);
    expect(claims).not.toHaveProperty('roll');
    expect(claims).not.toHaveProperty('email');
    await query('UPDATE student_enrollments SET expires_at=expires_at-1 WHERE roll=$1', [
      body.roll,
    ]);
    await expect(service.registry()).rejects.toThrow('REGISTRY_UNAVAILABLE');
    await query('UPDATE student_enrollments SET expires_at=$2 WHERE roll=$1', [body.roll, expiry]);
    const stale = await service.challenge('demo-b', origin, account.address);
    await query(
      "UPDATE challenges SET payload=jsonb_set(payload,'{expiresAt}',to_jsonb($2::text)) WHERE id=$1",
      [stale.id, new Date(Date.now() - 60000).toISOString()],
    );
    await expect(service.verify(stale.id, origin, signature, proof)).rejects.toThrow(
      'CHALLENGE_EXPIRED',
    );
    await query('UPDATE student_enrollments SET active=false WHERE roll=$1', [body.roll]);
    await expect(service.registry()).rejects.toThrow('REGISTRY_UNAVAILABLE');
    root = tree([]).root;
    expect((await service.registry()).leaves).toEqual([]);
    await expect(service.request(body, origin)).rejects.toThrow('ENROLLMENT_NOT_VERIFIED');
    // SMTP requests preserve issuer checks and never expose their code in the response.
    const recipient = 'real-student@example.com';
    await query('UPDATE student_enrollments SET active=true,email=$2 WHERE roll=$1', [
      body.roll,
      recipient,
    ]);
    const delivered: VerificationMail[] = [];
    let deliveryFails = false;
    const smtp = studentService({
      ...deps,
      mailDirectory: undefined,
      mailer: {
        mode: 'smtp',
        configured: async () => true,
        send: async (mail) => {
          delivered.push(mail);
          if (deliveryFails) throw new Error('provider-secret-must-not-leak');
        },
      },
    });
    const smtpBody = { ...body, email: recipient };
    const response = await smtp.request(smtpBody, origin);
    expect(response.emailMode).toBe('smtp');
    expect(response).not.toHaveProperty('code');
    expect(delivered[0].to).toBe(recipient);
    const stored = (
      await query('SELECT payload,code_hash FROM student_email_challenges WHERE id=$1', [
        response.id,
      ])
    ).rows[0] as { payload: Record<string, unknown>; code_hash: string };
    expect(stored.payload).not.toHaveProperty('code');
    expect(stored.code_hash).not.toBe(delivered[0].code);
    await expect(
      smtp.request({ ...smtpBody, email: 'attacker@example.com' }, origin),
    ).rejects.toThrow('ENROLLMENT_NOT_VERIFIED');
    expect(delivered).toHaveLength(1);
    deliveryFails = true;
    await expect(smtp.request(smtpBody, origin)).rejects.toThrow('EMAIL_DELIVERY_FAILED');
    await expect(smtp.issue(delivered[1].id, delivered[1].code, '0x1234', origin)).rejects.toThrow(
      'EMAIL_CODE_EXPIRED_OR_LOCKED',
    );
    deliveryFails = false;
    for (let i = 0; i < 3; i++) await smtp.request(smtpBody, origin);
    await expect(smtp.request(smtpBody, origin)).rejects.toThrow('EMAIL_RATE_LIMITED');
    expect(delivered).toHaveLength(5);
  } finally {
    await db.close();
    if (
      path.dirname(directory) !== path.resolve('.local') ||
      !path.basename(directory).startsWith('student-mail-test-')
    )
      throw new Error('Unexpected temp directory');
    await rm(directory, { recursive: true, force: true });
  }
}, 60000);
