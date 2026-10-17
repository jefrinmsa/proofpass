import { proofSchema, type Challenge, type AuthProof } from '@zk-auth/shared';
import { studentProofSchema, type StudentProof, type StudentChallenge } from '@zk-auth/shared';
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
export type { StudentProof, StudentChallenge };
/** Student login API. ID images and credential secrets are never accepted by these methods. */
export class StudentAuthClient {
  constructor(
    readonly apiUrl: string,
    readonly appId: string,
  ) {}
  private async send(route: string, body?: unknown) {
    const response = await fetch(new URL('/v1/student/' + route, this.apiUrl), {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok) throw new AuthenticationError(data.error?.code ?? 'REQUEST_FAILED');
    return data;
  }
  requestEnrollment(details: {
    roll: string;
    expiry: number;
    email: string;
    wallet: string;
    secretCommitment: string;
  }): Promise<{
    id: string;
    message: string;
    expiresAt: string;
    emailMode: 'local-test' | 'smtp';
  }> {
    const { roll, expiry, email, wallet, secretCommitment } = details;
    return this.send('enrollment/request', {
      appId: this.appId,
      roll,
      expiry,
      email,
      wallet,
      secretCommitment,
    });
  }
  confirmEnrollment(
    id: string,
    code: string,
    signature: string,
  ): Promise<{ issued: true; root: string }> {
    return this.send('enrollment/confirm', { id, code, signature });
  }
  registry(): Promise<{ root: string; leaves: string[] }> {
    return this.send('registry');
  }
  config(): Promise<{ emailMode: 'local-test' | 'smtp' | 'disabled'; emailConfigured: boolean }> {
    return this.send('config');
  }
  challenge(wallet: string): Promise<StudentChallenge> {
    return this.send('challenges', { appId: this.appId, wallet });
  }
  verify(
    challengeId: string,
    signature: string,
    proof: StudentProof,
  ): Promise<{ assertion: string; expiresIn: number; environment: 'test' }> {
    return this.send('auth/verify', {
      challengeId,
      signature,
      proof: studentProofSchema.parse(proof),
    });
  }
}
