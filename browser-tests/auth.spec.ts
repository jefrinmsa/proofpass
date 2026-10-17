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
  await page.screenshot({ path: '.local/student-lab.png', fullPage: true });
  await page.getByRole('button', { name: 'Connect browser wallet' }).click();
  console.log('Test wallet connected');
  await page.getByRole('button', { name: '1. Sign login challenge' }).click();
  console.log('Challenge requested');
  await expect(page.getByLabel('Synthetic QR credential')).toBeEnabled();
  await page.getByLabel('Synthetic QR credential').setInputFiles('fixtures/adult.png');
  await page.getByRole('button', { name: 'Generate private proof' }).click();
  await expect(page.getByRole('status')).toContainText(/Proof generated|PROOF_GENERATION_FAILED/, {
    timeout: 180000,
  });
  await expect(page.getByRole('status')).toContainText('Proof generated');
  await page.getByRole('button', { name: '3. Verify proof and sign in' }).click();
  await expect(page.getByText('Access granted to Student Lab')).toBeVisible();
  const subjectA = await page.locator('.success code').first().textContent();
  await page.getByRole('button', { name: 'Publish proof demonstration' }).click();
  await expect(page.locator('.transaction')).toContainText('gas used', { timeout: 30000 });
  await page.screenshot({ path: '.local/student-lab-authenticated.png', fullPage: true });
  await page.goto('http://localhost:3001');
  expect((await page.request.get('http://localhost:3001/api/library')).status()).toBe(401);
  expect((await page.request.get('http://localhost:3001/api/library/cn-notes')).status()).toBe(401);
  await expect(page.getByText('Access granted to Campus Library')).toHaveCount(0);
  await page.getByRole('button', { name: 'Connect browser wallet' }).click();
  await page.getByRole('button', { name: '1. Sign login challenge' }).click();
  await expect(page.getByLabel('Synthetic QR credential')).toBeEnabled();
  await page.getByLabel('Synthetic QR credential').setInputFiles('fixtures/adult.txt');
  await page.getByRole('button', { name: 'Generate private proof' }).click();
  await expect(page.getByRole('status')).toContainText('Proof generated', { timeout: 180000 });
  await page.getByRole('button', { name: '3. Verify proof and sign in' }).click();
  await expect(page.getByText('Access granted to Campus Library')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your reading shelf' })).toBeVisible();
  await expect(page.locator('.material-row')).toHaveCount(3);
  const protectedPdf = await page.request.get('http://localhost:3001/api/library/cn-notes');
  expect(protectedPdf.status()).toBe(200);
  expect((await protectedPdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
  const protectedSlides = await page.request.get(
    'http://localhost:3001/api/library/agile-operations?download=1',
  );
  expect(protectedSlides.status()).toBe(200);
  expect(protectedSlides.headers()['content-disposition']).toContain('attachment');
  await page.screenshot({ path: '.local/campus-library-materials.png', fullPage: true });
  expect(await page.locator('.success code').first().textContent()).not.toBe(subjectA);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  expect((await page.request.get('http://localhost:3001/api/library/cn-notes')).status()).toBe(401);
  await expect(page.getByText('Access granted to Campus Library')).toHaveCount(0);
  await page.getByRole('button', { name: '1. Sign login challenge' }).click();
  await expect(page.getByLabel('Synthetic QR credential')).toBeEnabled();
  await page.getByLabel('Synthetic QR credential').setInputFiles('fixtures/underage.png');
  await page.getByRole('button', { name: 'Generate private proof' }).click();
  await expect(page.getByRole('status')).toContainText(/Proof generated|PROOF_GENERATION_FAILED/, {
    timeout: 180000,
  });
  await expect(page.getByRole('status')).toContainText('Proof generated');
  await page.getByRole('button', { name: '3. Verify proof and sign in' }).click();
  await expect(page.getByRole('status')).toContainText('AGE_REQUIREMENT_NOT_MET');
  await expect(page.getByText('Access granted to Campus Library')).toHaveCount(0);
  await page.goto('http://localhost:3000');
  await expect(page.getByText('Access granted to Student Lab')).toBeVisible();
  for (const payload of posts) {
    expect(JSON.stringify(payload)).not.toMatch(
      /SYNTHETIC STUDENT|qrData|dateOfBirth|certificateFile|qrDataPadded|signature.*argumentType/,
    );
    expect(Object.keys(payload).sort()).toEqual(
      'appId' in payload ? ['appId', 'wallet'] : ['challengeId', 'proof', 'signature'],
    );
  }
  expect(posts.filter((p) => 'proof' in p)).toHaveLength(3);
  expect(errors).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '.local/student-lab-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
