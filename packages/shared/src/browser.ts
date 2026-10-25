export interface BrowserSettings {
  cloud: boolean;
  chainId: number;
  apiUrl: string;
  rpcUrl: string;
  studentLabUrl: string;
  libraryUrl: string;
}
export function browserSettings(env: Record<string, string | undefined>): BrowserSettings {
  const cloud = env.NEXT_PUBLIC_DEPLOYMENT_ENV === 'cloud';
  const chainId = Number(env.NEXT_PUBLIC_CHAIN_ID ?? (cloud ? '11155111' : '31337'));
  if (![31337, 11155111].includes(chainId) || (cloud && chainId !== 11155111))
    throw new Error('Invalid browser demo network');
  const url = (key: string, fallback: string) => {
    const value = env[key] ?? (cloud ? '' : fallback);
    if (!value) throw new Error(`Missing ${key}`);
    const parsed = new URL(value);
    if (
      (cloud && parsed.protocol !== 'https:') ||
      !['http:', 'https:'].includes(parsed.protocol) ||
      (cloud && ['localhost', '127.0.0.1'].includes(parsed.hostname))
    )
      throw new Error(`Invalid ${key}`);
    if (key !== 'NEXT_PUBLIC_RPC_URL' && parsed.origin !== value)
      throw new Error(`Expected exact origin for ${key}`);
    return value;
  };
  return {
    cloud,
    chainId,
    apiUrl: url('NEXT_PUBLIC_AUTH_API', 'http://localhost:4000'),
    rpcUrl: url(
      'NEXT_PUBLIC_RPC_URL',
      chainId === 31337 ? 'http://127.0.0.1:8545' : 'https://ethereum-sepolia-rpc.publicnode.com',
    ),
    studentLabUrl: url('NEXT_PUBLIC_STUDENT_LAB_URL', 'http://localhost:3000'),
    libraryUrl: url('NEXT_PUBLIC_LIBRARY_URL', 'http://localhost:3001'),
  };
}
