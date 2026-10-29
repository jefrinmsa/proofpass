import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { verifyMessage, type Hex, type Address } from 'viem';
import { challengeMessage, signalFor, type AuthProof, type Challenge } from '@zk-auth/shared';
import type { Store } from './store.js';
export class AuthError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}
export interface Dependencies {
  store: Store;
  chainId: number;
  verifier: Address;
  verifyProof(p: AuthProof): Promise<boolean>;
  signAssertion(claims: Record<string, unknown>): Promise<string>;
  now?: () => number;
}
export function createService(d: Dependencies) {
  const now = d.now ?? Date.now;
  return {
    async challenge(appId: string, origin: string, wallet: Address) {
      const app = await d.store.getApp(appId);
      if (!app || !app.origins.includes(origin)) throw new AuthError('ORIGIN_NOT_ALLOWED', 403);
      const fields = {
        id: randomUUID(),
        appId,
        origin,
        wallet,
        chainId: d.chainId,
        verifier: d.verifier,
        nonce: randomBytes(32).toString('hex'),
        expiresAt: new Date(now() + 300000).toISOString(),
        nullifierSeed: app.nullifierSeed,
      };
      const message = challengeMessage(fields);
      const c = { ...fields, message, signal: signalFor(message) };
      await d.store.saveChallenge(c);
      return c;
    },
    async verify(id: string, origin: string, signature: Hex, proof: AuthProof) {
      const c = await d.store.getChallenge(id);
      if (!c) throw new AuthError('CHALLENGE_NOT_FOUND', 404);
      if (Date.parse(c.expiresAt) <= now()) throw new AuthError('CHALLENGE_EXPIRED');
      const app = await d.store.getApp(c.appId);
      if (origin !== c.origin || !app?.origins.includes(origin))
        throw new AuthError('ORIGIN_NOT_ALLOWED', 403);
      if (c.chainId !== d.chainId || c.verifier !== d.verifier)
        throw new AuthError('WRONG_NETWORK');
      if (proof.signal !== c.signal) throw new AuthError('SIGNAL_MISMATCH');
      if (proof.nullifierSeed !== app.nullifierSeed || proof.nullifierSeed !== c.nullifierSeed)
        throw new AuthError('APP_SEED_MISMATCH');
      if (proof.reveal[0] !== '1') throw new AuthError('AGE_REQUIREMENT_NOT_MET', 403);
      if (proof.reveal.slice(1).some((x) => x !== '0'))
        throw new AuthError('UNEXPECTED_DISCLOSURE');
      if (BigInt(proof.timestamp) * 1000n > BigInt(now()))
        throw new AuthError('INVALID_QR_TIMESTAMP');
      let walletOk = false;
      try {
        walletOk = await verifyMessage({ address: c.wallet, message: c.message, signature });
      } catch {
        /* malformed signature */
      }
      if (!walletOk) throw new AuthError('WALLET_MISMATCH', 401);
      let valid: boolean;
      try {
        valid = await d.verifyProof(proof);
      } catch {
        throw new AuthError('VERIFICATION_UNAVAILABLE', 503);
      }
      if (!valid) throw new AuthError('INVALID_PROOF', 401);
      // Prepare the assertion before consumption; a signing outage must not burn a challenge.
      const assertion = await d.signAssertion({
        aud: c.appId,
        sub: createHash('sha256').update(`${c.appId}:${proof.nullifier}`).digest('hex'),
        wallet: c.wallet,
        ageAbove18: true,
        agePolicy: 'completed-age-greater-than-18-at-qr-signing',
        environment: 'test',
        jti: randomUUID(),
      });
      if (!(await d.store.consumeChallenge(id)))
        throw new AuthError('CHALLENGE_USED_OR_EXPIRED', 409);
      return { assertion, expiresIn: 300, environment: 'test' as const };
    },
  };
}
