import { describe, it, expect } from 'vitest';
import { generateKeyPair, SignJWT, createLocalJWKSet, exportJWK } from 'jose';
import { createAssertionVerifier } from '../packages/sdk/src/server';
describe('application assertions', () => {
  it('validates audience, signature, environment, age policy and expiry', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const jwks = { keys: [{ ...(await exportJWK(publicKey)), kid: 'test', alg: 'RS256' }] };
    const verify = createAssertionVerifier({
      issuer: 'http://localhost:4000',
      audience: 'demo-a',
      jwksUrl: 'http://localhost:4000/.well-known/jwks.json',
      key: createLocalJWKSet(jwks),
    });
    const base = {
      wallet: '0x' + '11'.repeat(20),
      ageAbove18: true,
      agePolicy: 'completed-age-greater-than-18-at-qr-signing',
      environment: 'test',
    };
    const token = (claims: object = {}, aud = 'demo-a', expires = '5m') =>
      new SignJWT({ ...base, ...claims })
        .setProtectedHeader({ alg: 'RS256', kid: 'test' })
        .setIssuer('http://localhost:4000')
        .setAudience(aud)
        .setSubject('app-specific-subject')
        .setJti('unique')
        .setIssuedAt()
        .setExpirationTime(expires)
        .sign(privateKey);
    expect((await verify(await token())).sub).toBe('app-specific-subject');
    await expect(verify(await token({}, 'demo-b'))).rejects.toThrow();
    await expect(verify(await token({ environment: 'production' }))).rejects.toThrow();
    await expect(verify(await token({ ageAbove18: false }))).rejects.toThrow();
    await expect(verify(await token({}, 'demo-a', '-1s'))).rejects.toThrow();
  });
});
