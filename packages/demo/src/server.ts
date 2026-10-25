import { randomBytes, createHash } from 'node:crypto';
import pg from 'pg';
import { NextResponse, type NextRequest } from 'next/server';
import { createAssertionVerifier } from '@zk-auth/sdk/server';
import { createDbPool, authIssuer, exactOrigin } from '@zk-auth/shared/server';
const pool = createDbPool();
const hash = (v: string) => createHash('sha256').update(v).digest('hex');
export async function readSession(req: NextRequest, appId: string, db: pg.Pool = pool) {
  const token = req.cookies.get(`zk_${appId.replaceAll('-', '_')}`)?.value;
  if (!token) return undefined;
  const result = await db.query(
    'SELECT claims FROM sessions WHERE token_hash=$1 AND app_id=$2 AND expires_at>NOW()',
    [hash(token), appId],
  );
  const claims = result.rows[0]?.claims;
  // Legacy age-only sessions cannot authorize student materials.
  if (
    !claims?.studentEnrolled ||
    claims.credentialPolicy !== 'active-enrollment-unexpired-card-email-wallet-v1' ||
    typeof claims.accessUntil !== 'number' ||
    claims.accessUntil <= Date.now() / 1000
  )
    return undefined;
  const registry = await fetch(`${authIssuer()}/v1/student/registry`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  if (!registry.ok) throw new Error('REGISTRY_UNAVAILABLE');
  if ((await registry.json()).root !== claims.registryRoot) return undefined;
  return claims as { sub: string; wallet: string };
}
export function sessionHandlers(
  appId: string,
  origin: string,
  dependencies?: { pool: pg.Pool; verify?: ReturnType<typeof createAssertionVerifier> },
) {
  const sessionPool = dependencies?.pool ?? pool;
  const cookie = `zk_${appId.replaceAll('-', '_')}`;
  const issuer = authIssuer();
  exactOrigin(origin);
  const verify =
    dependencies?.verify ??
    createAssertionVerifier({
      issuer,
      audience: appId,
      jwksUrl: `${issuer}/.well-known/jwks.json`,
    });
  const secure = new URL(origin).protocol === 'https:';
  const response = (body: unknown, status = 200) =>
    NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  return {
    async GET(req: NextRequest) {
      try {
        const user = await readSession(req, appId, sessionPool);
        return response(user ? { authenticated: true, user } : { authenticated: false });
      } catch {
        return response({ error: 'SESSION_UNAVAILABLE' }, 503);
      }
    },
    async POST(req: NextRequest) {
      if (req.headers.get('origin') !== origin)
        return response({ error: 'ORIGIN_NOT_ALLOWED' }, 403);
      if (Number(req.headers.get('content-length') ?? 0) > 8192)
        return response({ error: 'INVALID_REQUEST' }, 400);
      let claims;
      try {
        const body = await req.json();
        if (typeof body.assertion !== 'string' || body.assertion.length > 8192) throw new Error();
        claims = await verify(body.assertion);
      } catch {
        return response({ error: 'INVALID_ASSERTION' }, 401);
      }
      const db = await sessionPool.connect();
      try {
        await db.query('BEGIN');
        const redeemed = await db.query(
          'INSERT INTO assertion_redemptions(app_id,jti,expires_at) VALUES($1,$2,to_timestamp($3)) ON CONFLICT DO NOTHING RETURNING jti',
          [appId, claims.jti, claims.exp],
        );
        if (!redeemed.rowCount) {
          await db.query('ROLLBACK');
          return response({ error: 'ASSERTION_ALREADY_USED' }, 409);
        }
        const token = randomBytes(32).toString('hex');
        await db.query(
          "INSERT INTO sessions(token_hash,app_id,claims,expires_at) VALUES($1,$2,$3,LEAST(NOW()+INTERVAL '8 hours',to_timestamp($4)))",
          [
            hash(token),
            appId,
            {
              sub: claims.sub,
              wallet: claims.wallet,
              studentEnrolled: true,
              credentialPolicy: claims.credentialPolicy,
              registryRoot: claims.registryRoot,
              accessUntil: claims.accessUntil,
              environment: 'test',
            },
            claims.accessUntil,
          ],
        );
        await db.query('COMMIT');
        const result = response({ authenticated: true });
        result.cookies.set(cookie, token, {
          httpOnly: true,
          secure,
          sameSite: 'strict',
          path: '/',
          maxAge: 28800,
        });
        return result;
      } catch {
        await db.query('ROLLBACK');
        return response({ error: 'SESSION_UNAVAILABLE' }, 503);
      } finally {
        db.release();
      }
    },
    async DELETE(req: NextRequest) {
      if (req.headers.get('origin') !== origin)
        return response({ error: 'ORIGIN_NOT_ALLOWED' }, 403);
      const token = req.cookies.get(cookie)?.value;
      if (token)
        await sessionPool.query('DELETE FROM sessions WHERE token_hash=$1 AND app_id=$2', [
          hash(token),
          appId,
        ]);
      const result = response({ authenticated: false });
      result.cookies.set(cookie, '', {
        httpOnly: true,
        secure,
        sameSite: 'strict',
        path: '/',
        maxAge: 0,
      });
      return result;
    },
  };
}
