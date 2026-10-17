import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { createPublicClient, createWalletClient, http, type Address } from 'viem';
import { hardhat } from 'viem/chains';
import { studentAbi } from '@zk-auth/shared';
import { studentCrypto } from '../packages/shared/src/student-crypto';
import { z } from 'zod';
const [action, value, extra] = process.argv.slice(2);
if (action === 'mail') {
  if (!/^[0-9a-f-]{36}$/.test(value ?? ''))
    throw new Error('Usage: npm run student:mail -- REQUEST_ID');
  console.log(await readFile(path.resolve('.local/student-mail', `${value}.json`), 'utf8'));
} else {
  const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const conn = await db.connect();
  try {
    if (action !== 'configure') {
      if (process.env.CHAIN_ID !== '31337' || process.env.STUDENT_LOCAL_ISSUER !== 'true')
        throw new Error('Local test issuer only');
      await conn.query('BEGIN');
      await conn.query('SELECT pg_advisory_xact_lock(7342091)');
    }
    if (action === 'seed') {
      // Deliberately non-deliverable addresses. Never seed real student information into Git.
      for (const [roll, email, expiry, active] of [
        ['CSE2026001', 'student1@students.example.test', '2027-06-30', true],
        ['CSE2026002', 'student2@students.example.test', '2027-06-30', true],
        ['CSE2025003', 'expired@students.example.test', '2025-06-30', true],
        ['CSE2026004', 'inactive@students.example.test', '2027-06-30', false],
      ] as const)
        await conn.query(
          'INSERT INTO student_enrollments(roll,email,expires_at,active) VALUES($1,$2,$3,$4) ON CONFLICT(roll) DO NOTHING',
          [roll, email, Math.floor(Date.parse(`${expiry}T23:59:59Z`) / 1000), active],
        );
    } else if (action === 'email') {
      if (!/^[A-Z0-9-]{3,40}$/.test(value ?? '')) throw new Error('Supply a roll number');
      const email = z.string().email().max(254).parse(extra).toLowerCase();
      const updated = await conn.query(
        'UPDATE student_enrollments SET email=$2 WHERE roll=$1 RETURNING roll',
        [value, email],
      );
      if (!updated.rowCount) throw new Error('Unknown enrollment');
      // Mailbox changes require fresh issuance and invalidate older pending requests.
      await conn.query('DELETE FROM student_credentials WHERE roll=$1', [value]);
      await conn.query("DELETE FROM student_email_challenges WHERE payload->>'roll'=$1", [value]);
    } else if (action === 'revoke' || action === 'activate') {
      if (!/^[A-Z0-9-]{3,40}$/.test(value ?? '')) throw new Error('Supply a roll number');
      const updated = await conn.query(
        'UPDATE student_enrollments SET active=$2 WHERE roll=$1 RETURNING roll',
        [value, action === 'activate'],
      );
      if (!updated.rowCount) throw new Error('Unknown enrollment');
    } else if (action === 'configure') {
      const dep = JSON.parse(await readFile('deployments/student-localhost.json', 'utf8'));
      let env = await readFile('.env', 'utf8');
      for (const [key, val] of Object.entries({
        STUDENT_VERIFIER_ADDRESS: dep.verifier,
        STUDENT_MAIL_DIRECTORY: '.local/student-mail',
        STUDENT_LOCAL_ISSUER: 'true',
      })) {
        env = new RegExp(`^${key}=.*$`, 'm').test(env)
          ? env.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${val}`)
          : env + `\n${key}=${val}`;
      }
      await writeFile('.env', env);
      console.log('Configured local student issuer. Restart API.');
    } else throw new Error('Use seed, revoke, activate, email, configure or mail');
    if (action !== 'configure') {
      if (process.env.CHAIN_ID !== '31337' || process.env.STUDENT_LOCAL_ISSUER !== 'true')
        throw new Error('Local test issuer only');
      const publicClient = createPublicClient({
        chain: hardhat,
        transport: http(process.env.RPC_URL),
      });
      const wallet = createWalletClient({ chain: hardhat, transport: http(process.env.RPC_URL) });
      const [account] = await wallet.getAddresses();
      const rows = await conn.query(
        'SELECT c.leaf FROM student_credentials c JOIN student_enrollments e USING(roll) WHERE e.active=true AND c.expires_at=e.expires_at ORDER BY c.roll',
      );
      const { tree } = await studentCrypto();
      const root = tree(rows.rows.map((r) => r.leaf)).root;
      const hash = await wallet.writeContract({
        account,
        address: process.env.STUDENT_VERIFIER_ADDRESS as Address,
        abi: studentAbi,
        functionName: 'setRegistryRoot',
        args: [BigInt(root)],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') throw new Error('Registry update failed');
      await conn.query('COMMIT');
      console.log(
        'Enrollment registry synchronized. Existing sessions from older roots require a new proof.',
      );
    }
  } catch (e) {
    if (action !== 'configure') await conn.query('ROLLBACK');
    throw e;
  } finally {
    conn.release();
    await db.end();
  }
}
