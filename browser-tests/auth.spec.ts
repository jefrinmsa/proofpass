import { readFile } from 'node:fs/promises';
import 'dotenv/config';
import pg from 'pg';
import { createPublicClient, createWalletClient, http } from 'viem';
import { hardhat } from 'viem/chains';
import { studentAbi } from '../packages/shared/src/student';
import { studentCrypto } from '../packages/shared/src/student-crypto';
import { test, expect } from '@playwright/test';
import { privateKeyToAccount } from 'viem/accounts';
// Public Hardhat development account; used only by this browser test, never shipped to clients.
const account = privateKeyToAccount(
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
);
test('two applications perform real browser proofs and keep sessions isolated', async ({
  context,
  page,
}) => {
  const posts: Record<string, unknown>[] = [];
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await context.exposeFunction('__testWalletRequest', async (method: string, params: unknown[]) => {
    if (['eth_accounts', 'eth_requestAccounts'].includes(method)) return [account.address];
    if (method === 'eth_chainId') return '0x7a69';
    if (method === 'net_version') return '31337';
    if (method === 'personal_sign') {
      const message = params[0] as `0x${string}`;
      return account.signMessage({ message: { raw: message } });
    }
    if (method === 'wallet_switchEthereumChain') return null;
    const r = await fetch('http://127.0.0.1:8545', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const data = await r.json();
    if (data.error) throw new Error(data.error.message);
    return data.result;
  });
  await context.addInitScript(() => {
    const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
    (window as unknown as { ethereum: unknown }).ethereum = {
      isMetaMask: true,
      isConnected: () => true,
      request: ({ method, params = [] }: { method: string; params?: unknown[] }) =>
        (
          window as unknown as {
            __testWalletRequest: (m: string, p: unknown[]) => Promise<unknown>;
          }
        ).__testWalletRequest(method, params),
      on: (event: string, fn: (...args: unknown[]) => void) => {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event)!.add(fn);
      },
      removeListener: (event: string, fn: (...args: unknown[]) => void) =>
        listeners.get(event)?.delete(fn),
    };
  });
  page.on('request', (req) => {
    if (req.url().includes(':4000/v1/') && req.method() === 'POST') posts.push(req.postDataJSON());
  });

  await page.goto('http://localhost:3000');
  await expect(
    page.getByText('Test credentials — educational demonstration', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Connect browser wallet' }).click();
  await expect(page.getByLabel('Student ID photo', { exact: true })).toBeEnabled();
  await page
    .getByLabel('Student ID photo', { exact: true })
    .setInputFiles('fixtures/student-card.png');
  await expect(page.getByRole('status')).toContainText('Review the extracted', { timeout: 120000 });
  await expect(page.getByLabel('Roll number', { exact: true })).toHaveValue('CSE2026001');
  await expect(page.getByLabel('Card expiry date')).toHaveValue('2027-06-30');
  await page.getByLabel('Registered college email').fill('student1@students.example.test');
  const pendingResponse = page.waitForResponse(
    (r) => r.url().endsWith('/enrollment/request') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Request verification code' }).click();
  const pending = await (await pendingResponse).json();
  expect(pending.emailMode).toBe('local-test');
  const mail = JSON.parse(await readFile('.local/student-mail/' + pending.id + '.json', 'utf8'));
  await page.getByLabel('Email verification code').fill(mail.code);
  await page.getByRole('button', { name: 'Verify code and issue credential' }).click();
  await expect(page.getByRole('status')).toContainText('Enrollment verified', { timeout: 30000 });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save private credential' }).click();
  await (await download).saveAs('.local/browser-student-credential.json');
  await page.getByRole('button', { name: 'Generate student proof' }).click();
  await expect(page.getByRole('status')).toContainText('Private enrollment proof ready', {
    timeout: 120000,
  });
  const aResponse = page.waitForResponse((r) => r.url().endsWith('/student/auth/verify'));
  await page.getByRole('button', { name: 'Verify proof and sign in', exact: true }).click();
  const aAssertion = (await (await aResponse).json()).assertion;
  await expect(page.getByText('Access granted to Student Lab')).toBeVisible();
  const subjectA = await page.locator('.success code').first().textContent();
  await page.getByRole('button', { name: 'Publish proof demonstration' }).click();
  await expect(page.locator('.transaction')).toContainText('gas used', { timeout: 30000 });
  await page.screenshot({ path: '.local/student-lab-student-auth.png', fullPage: true });
  await page.goto('http://localhost:3001');
  expect((await page.request.get('/api/library')).status()).toBe(401);
  expect((await page.request.get('/api/library/cn-notes')).status()).toBe(401);
  expect(
    (
      await page.request.post('/api/session', {
        headers: { origin: 'http://localhost:3001' },
        data: { assertion: aAssertion },
      })
    ).status(),
  ).toBe(401);
  await page.getByRole('button', { name: 'Connect browser wallet' }).click();
  await expect(page.getByLabel('Load a saved student credential')).toBeEnabled();
  await page
    .getByLabel('Load a saved student credential')
    .setInputFiles('.local/browser-student-credential.json');
  await expect(page.getByRole('status')).toContainText('Private credential loaded');
  await page.getByRole('button', { name: 'Generate student proof' }).click();
  await expect(page.getByRole('status')).toContainText('Private enrollment proof ready', {
    timeout: 120000,
  });
  await page.getByRole('button', { name: 'Verify proof and sign in', exact: true }).click();
  await expect(page.getByText('Access granted to Campus Library')).toBeVisible();
  await expect(page.locator('.material-row')).toHaveCount(3);
  expect(await page.locator('.success code').first().textContent()).not.toBe(subjectA);
  const pdf = await page.request.get('/api/library/cn-notes');
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
  const ppt = await page.request.get('/api/library/agile-operations?download=1');
  expect(ppt.status()).toBe(200);
  expect(ppt.headers()['content-disposition']).toContain('attachment');
  await page.screenshot({ path: '.local/campus-library-student-materials.png', fullPage: true });
  const proofPosts = posts.filter((p) => 'proof' in p);
  expect(proofPosts).toHaveLength(2);
  for (const p of proofPosts) {
    expect(Object.keys(p).sort()).toEqual(['challengeId', 'proof', 'signature']);
    expect(JSON.stringify(p)).not.toMatch(/roll|expiry|email|secret|photo|image|CSE2026001/);
  }
  for (const p of posts)
    expect(JSON.stringify(p)).not.toMatch(/data:image|base64|qrData|dateOfBirth/);
  const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = createPublicClient({ chain: hardhat, transport: http(process.env.RPC_URL) });
  const issuer = createWalletClient({ chain: hardhat, transport: http(process.env.RPC_URL) });
  async function sync() {
    const rows = await db.query(
      'SELECT c.leaf FROM student_credentials c JOIN student_enrollments e USING(roll) WHERE e.active=true AND c.expires_at=e.expires_at ORDER BY c.roll',
    );
    const { tree } = await studentCrypto();
    const root = tree(rows.rows.map((r) => r.leaf)).root;
    const tx = await issuer.writeContract({
      account: account.address,
      address: process.env.STUDENT_VERIFIER_ADDRESS as `0x${string}`,
      abi: studentAbi,
      functionName: 'setRegistryRoot',
      args: [BigInt(root)],
    });
    await client.waitForTransactionReceipt({ hash: tx });
  }
  try {
    await db.query('UPDATE student_enrollments SET active=false WHERE roll=$1', ['CSE2026001']);
    expect((await page.request.get('/api/library/cn-notes')).status()).toBe(503);
    await sync();
    expect((await page.request.get('/api/library/cn-notes')).status()).toBe(401);
  } finally {
    await db.query('UPDATE student_enrollments SET active=true WHERE roll=$1', ['CSE2026001']);
    await sync();
    await db.end();
  }
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  expect((await page.request.get('/api/library/cn-notes')).status()).toBe(401);
  await page.getByLabel('Roll number', { exact: true }).fill('NOT-ENROLLED');
  await page.getByLabel('Card expiry date').fill('2027-06-30');
  await page.getByLabel('Registered college email').fill('student1@students.example.test');
  await page.getByRole('button', { name: 'Request verification code' }).click();
  await expect(page.getByRole('status')).toContainText('ENROLLMENT_NOT_VERIFIED');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '.local/student-login-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(errors).toEqual([]);
});
