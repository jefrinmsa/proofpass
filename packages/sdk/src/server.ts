import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
export interface AssertionClaims {
  sub: string;
  wallet: string;
  ageAbove18: true;
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
      payload.ageAbove18 !== true ||
      payload.agePolicy !== 'completed-age-greater-than-18-at-qr-signing' ||
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
