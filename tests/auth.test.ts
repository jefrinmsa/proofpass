import { describe, it, expect, beforeEach, vi } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { createService } from '../apps/api/src/service';
import { buildServer } from '../apps/api/src/server';
import type { Store, Application } from '../apps/api/src/store';
import {
  proofSchema,
  challengeMessage,
  signalFor,
  type Challenge,
  type AuthProof,
} from '../packages/shared/src/index';
const wallet = privateKeyToAccount(('0x' + '11'.repeat(32)) as `0x${string}`);
const other = privateKeyToAccount(('0x' + '22'.repeat(32)) as `0x${string}`);
const verifier = ('0x' + 'ab'.repeat(20)) as `0x${string}`;
class MemoryStore implements Store {
  apps = new Map<string, Application>([
    ['demo-a', { id: 'demo-a', origins: ['http://localhost:3000'], nullifierSeed: '123' }],
    ['demo-b', { id: 'demo-b', origins: ['http://localhost:3001'], nullifierSeed: '456' }],
  ]);
  challenges = new Map<string, Challenge>();
  used = new Set<string>();
  async getApp(id: string) {
    return this.apps.get(id);
  }
  async saveChallenge(c: Challenge) {
    this.challenges.set(c.id, c);
  }
  async getChallenge(id: string) {
    return this.challenges.get(id);
  }
  async consumeChallenge(id: string) {
    if (this.used.has(id)) return false;
    this.used.add(id);
    return true;
  }
}
describe('challenge-bound authentication (unit verifier dependency)', () => {
  let store: MemoryStore;
  let now: number;
  let verifyProof: ReturnType<typeof vi.fn>;
  let service: ReturnType<typeof createService>;
  beforeEach(() => {
    store = new MemoryStore();
    now = Date.now();
    verifyProof = vi.fn().mockResolvedValue(true);
    service = createService({
      store,
      chainId: 31337,
      verifier,
      verifyProof,
      signAssertion: async () => 'signed-assertion',
      now: () => now,
    });
  });
  async function input() {
    const c = await service.challenge('demo-a', 'http://localhost:3000', wallet.address);
    const signature = await wallet.signMessage({ message: c.message });
    const proof: AuthProof = {
      nullifierSeed: '123',
      nullifier: '789',
      timestamp: '1700000000',
      signal: c.signal,
      reveal: ['1', '0', '0', '0'],
      groth16: ['0', '0', '0', '0', '0', '0', '0', '0'],
    };
    return { c, signature, proof };
  }
  it('authenticates an eligible credential through the supplied verifier', async () => {
    const { c, signature, proof } = await input();
    expect((await service.verify(c.id, c.origin, signature, proof)).assertion).toBe(
      'signed-assertion',
    );
    expect(verifyProof).toHaveBeenCalledWith(proof);
  });
  it('rejects an underage result', async () => {
    const { c, signature, proof } = await input();
    proof.reveal[0] = '0';
    await expect(service.verify(c.id, c.origin, signature, proof)).rejects.toMatchObject({
      code: 'AGE_REQUIREMENT_NOT_MET',
    });
  });
  it('rejects wrong wallet signatures', async () => {
    const { c, proof } = await input();
    await expect(
      service.verify(c.id, c.origin, await other.signMessage({ message: c.message }), proof),
    ).rejects.toMatchObject({ code: 'WALLET_MISMATCH' });
  });
  it('rejects expired challenges', async () => {
    const { c, signature, proof } = await input();
    now += 300000;
    await expect(service.verify(c.id, c.origin, signature, proof)).rejects.toMatchObject({
      code: 'CHALLENGE_EXPIRED',
    });
  });
  it('rejects replay', async () => {
    const { c, signature, proof } = await input();
    await service.verify(c.id, c.origin, signature, proof);
    await expect(service.verify(c.id, c.origin, signature, proof)).rejects.toMatchObject({
      code: 'CHALLENGE_USED_OR_EXPIRED',
    });
  });
  it('allows exactly one concurrent redemption', async () => {
    const { c, signature, proof } = await input();
    const r = await Promise.allSettled([
      service.verify(c.id, c.origin, signature, proof),
      service.verify(c.id, c.origin, signature, proof),
    ]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
  });
  it('rejects altered signals', async () => {
    const { c, signature, proof } = await input();
    proof.signal = '42';
    await expect(service.verify(c.id, c.origin, signature, proof)).rejects.toMatchObject({
      code: 'SIGNAL_MISMATCH',
    });
  });
  it('rejects another application seed', async () => {
    const { c, signature, proof } = await input();
    proof.nullifierSeed = '456';
    await expect(service.verify(c.id, c.origin, signature, proof)).rejects.toMatchObject({
      code: 'APP_SEED_MISMATCH',
    });
  });
  it('rejects another application origin', async () => {
    const { c, signature, proof } = await input();
    await expect(
      service.verify(c.id, 'http://localhost:3001', signature, proof),
    ).rejects.toMatchObject({ code: 'ORIGIN_NOT_ALLOWED' });
  });
  it('fails closed on an RPC outage, without consuming the challenge', async () => {
    const { c, signature, proof } = await input();
    verifyProof.mockRejectedValueOnce(new Error('offline'));
    await expect(service.verify(c.id, c.origin, signature, proof)).rejects.toMatchObject({
      code: 'VERIFICATION_UNAVAILABLE',
    });
    expect(store.used.size).toBe(0);
  });
  it('rejects a cryptographically invalid proof without consumption', async () => {
    const { c, signature, proof } = await input();
    verifyProof.mockResolvedValueOnce(false);
    await expect(service.verify(c.id, c.origin, signature, proof)).rejects.toMatchObject({
      code: 'INVALID_PROOF',
    });
    expect(store.used.size).toBe(0);
  });
  it('rejects unexpected disclosed data', async () => {
    const { c, signature, proof } = await input();
    proof.reveal[1] = '70';
    await expect(service.verify(c.id, c.origin, signature, proof)).rejects.toMatchObject({
      code: 'UNEXPECTED_DISCLOSURE',
    });
  });
  it('binds the network and contract', async () => {
    const { c, signature, proof } = await input();
    c.chainId = 1;
    await expect(service.verify(c.id, c.origin, signature, proof)).rejects.toMatchObject({
      code: 'WRONG_NETWORK',
    });
  });
  it('canonical message changes for every security context', async () => {
    const { c } = await input();
    for (const patch of [
      { appId: 'demo-b' },
      { origin: 'https://example.com' },
      { wallet: other.address },
      { chainId: 11155111 },
      { verifier: other.address },
      { nonce: 'other' },
      { expiresAt: '2030-01-01T00:00:00.000Z' },
    ])
      expect(signalFor(challengeMessage({ ...c, ...patch }))).not.toBe(c.signal);
  });
  it('HTTP API rejects document fields and exposes no request payload in errors', async () => {
    const app = await buildServer(
      { store, chainId: 31337, verifier, verifyProof, signAssertion: async () => 'token' },
      { keys: [] },
    );
    try {
      const r = await app.inject({
        method: 'POST',
        url: '/v1/challenges',
        headers: { origin: 'http://localhost:3000' },
        payload: { appId: 'demo-a', wallet: wallet.address, aadhaarDocument: 'SECRET' },
      });
      expect(r.statusCode).toBe(400);
      expect(r.body).not.toContain('SECRET');
      expect(r.headers['cache-control']).toBe('no-store');
    } finally {
      await app.close();
    }
  });
  it('HTTP round-trip accepts only the public proof envelope', async () => {
    const app = await buildServer(
      { store, chainId: 31337, verifier, verifyProof, signAssertion: async () => 'token' },
      { keys: [] },
    );
    try {
      const { c, signature, proof } = await input();
      const r = await app.inject({
        method: 'POST',
        url: '/v1/auth/verify',
        headers: { origin: c.origin },
        payload: { challengeId: c.id, signature, proof },
      });
      expect(r.statusCode).toBe(200);
      expect(r.json().assertion).toBe('token');
    } finally {
      await app.close();
    }
  });
  it('validates proof field ranges and rejects unknown fields', () => {
    expect(proofSchema.safeParse({ name: 'private' }).success).toBe(false);
  });
});
