import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { STUDENT_POLICY } from '@zk-auth/shared';
export interface AssertionClaims {
  sub: string;
  wallet: string;
  studentEnrolled: true;
  credentialPolicy: string;
  registryRoot: string;
  accessUntil: number;
  environment: 'test';
  jti: string;
  exp: number;
  aud: string;
}
export function createAssertionVerifier(options: {
  issuer: string;
  audience: string;
  jwksUrl: string;
  key?: JWTVerifyGetKey;
}) {
  const key = options.key ?? createRemoteJWKSet(new URL(options.jwksUrl));
  return async (token: string): Promise<AssertionClaims> => {
    const { payload } = await jwtVerify(token, key, {
      issuer: options.issuer,
      audience: options.audience,
      algorithms: ['RS256'],
      maxTokenAge: '5m',
      requiredClaims: ['exp', 'iat', 'sub', 'jti', 'aud'],
    });
    if (
      payload.environment !== 'test' ||
      payload.studentEnrolled !== true ||
      payload.credentialPolicy !== STUDENT_POLICY ||
      typeof payload.registryRoot !== 'string' ||
      !/^[1-9][0-9]{0,77}$/.test(payload.registryRoot) ||
      typeof payload.accessUntil !== 'number' ||
      !Number.isInteger(payload.accessUntil) ||
      payload.accessUntil <= Date.now() / 1000 ||
      payload.accessUntil > Date.now() / 1000 + 28800 ||
      typeof payload.wallet !== 'string' ||
      !/^0x[0-9a-fA-F]{40}$/.test(payload.wallet) ||
      typeof payload.sub !== 'string' ||
      typeof payload.jti !== 'string' ||
      payload.aud !== options.audience
    )
      throw new Error('INVALID_ASSERTION');
    return payload as unknown as AssertionClaims;
  };
}
