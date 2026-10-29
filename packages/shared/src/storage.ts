import { requiredEnv, type Environment } from './server';

export function storageClient(env: Environment = process.env) {
  const base = new URL(requiredEnv('SUPABASE_URL', env));
  if (base.protocol !== 'https:' || base.pathname !== '/')
    throw new Error('SUPABASE_URL must be an HTTPS project origin');
  const key = requiredEnv('SUPABASE_SERVICE_ROLE_KEY', env);
  async function request(route: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set('apikey', key);
    headers.set('Authorization', `Bearer ${key}`);
    const response = await fetch(new URL('/storage/v1/' + route, base), {
      ...init,
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error('STORAGE_UNAVAILABLE');
    return response;
  }
  const encoded = (value: string) => value.split('/').map(encodeURIComponent).join('/');
  return {
    request,
    async info(bucket: string, name: string) {
      const response = await request(`object/info/${encoded(bucket)}/${encoded(name)}`);
      const value = await response.json();
      const size = Number(value.metadata?.size ?? value.size);
      if (!Number.isSafeInteger(size) || size < 0) throw new Error('STORAGE_UNAVAILABLE');
      return { size };
    },
    async sign(bucket: string, name: string, download: boolean, downloadName = name) {
      const response = await request(`object/sign/${encoded(bucket)}/${encoded(name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresIn: 60 }),
      });
      const value = await response.json();
      const path = value.signedURL ?? value.signedUrl;
      if (typeof path !== 'string') throw new Error('STORAGE_UNAVAILABLE');
      const url = new URL(
        path.startsWith('/storage/v1/') ? path : '/storage/v1/' + path.replace(/^\//, ''),
        base,
      );
      if (
        url.origin !== base.origin ||
        !url.pathname.startsWith(`/storage/v1/object/sign/${encoded(bucket)}/`)
      )
        throw new Error('STORAGE_UNAVAILABLE');
      if (download) url.searchParams.set('download', downloadName);
      return url.toString();
    },
  };
}
