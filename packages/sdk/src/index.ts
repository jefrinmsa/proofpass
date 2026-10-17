import { proofSchema, type Challenge, type AuthProof } from '@zk-auth/shared';
export class AuthenticationError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export class ZkAuthClient {
  constructor(
    readonly apiUrl: string,
    readonly appId: string,
  ) {}
  private async post(path: string, body: unknown) {
    const r = await fetch(new URL(path, this.apiUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await r.json();
    if (!r.ok) throw new AuthenticationError(data.error?.code ?? 'REQUEST_FAILED');
    return data;
  }
  challenge(wallet: string): Promise<Challenge> {
    return this.post('/v1/challenges', { appId: this.appId, wallet });
  }
  verify(
    challengeId: string,
    signature: string,
    proof: AuthProof,
  ): Promise<{ assertion: string; expiresIn: number; environment: 'test' }> {
    return this.post('/v1/auth/verify', {
      challengeId,
      signature,
      proof: proofSchema.parse(proof),
    });
  }
}
export type { Challenge, AuthProof };
