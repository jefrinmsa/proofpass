'use client';
import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  WagmiProvider,
  createConfig,
  http,
  useAccount,
  useConnect,
  useDisconnect,
  useWriteContract,
  usePublicClient,
} from 'wagmi';
import { injected } from 'wagmi/connectors';
import { hardhat, sepolia } from 'wagmi/chains';
import { ZkAuthButton } from '@zk-auth/sdk/react';
import {
  AGE_POLICY,
  EDUCATIONAL_NOTICE,
  authAbi,
  proofArgs,
  type AuthProof,
  type Challenge,
} from '@zk-auth/shared';
const config = createConfig({
  chains: [hardhat, sepolia],
  connectors: [injected()],
  transports: { [hardhat.id]: http('http://127.0.0.1:8545'), [sepolia.id]: http() },
});
const queryClient = new QueryClient();
export function Demo({ appId, title, accent }: { appId: string; title: string; accent: string }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <Content appId={appId} title={title} accent={accent} />
      </QueryClientProvider>
    </WagmiProvider>
  );
}
function Content({ appId, title, accent }: { appId: string; title: string; accent: string }) {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, error: walletError } = useConnect();
  const { disconnect } = useDisconnect();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const [user, setUser] = useState<{ sub: string; wallet: string } | null>(null);
  const [proof, setProof] = useState<{ p: AuthProof; c: Challenge }>();
  const [transaction, setTransaction] = useState('');
  const [error, setError] = useState('');
  async function refresh() {
    const r = await fetch('/api/session', { cache: 'no-store' });
    const data = await r.json();
    setUser(data.user ?? null);
  }
  useEffect(() => {
    void refresh().catch(() => setError('Session service unavailable. Check PostgreSQL.'));
  }, []);
  useEffect(() => {
    setProof(undefined);
  }, [address, chainId]);
  async function authenticated(assertion: string) {
    const r = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assertion }),
    });
    if (!r.ok) throw new Error((await r.json()).error);
    await refresh();
  }
  async function publish() {
    if (!proof || !publicClient) return;
    try {
      const hash = await writeContractAsync({
        address: proof.c.verifier,
        abi: authAbi,
        functionName: 'demonstrate',
        args: proofArgs(proof.p),
        chainId: proof.c.chainId,
      });
      setTransaction(hash);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      setTransaction(`${hash} · ${receipt.status} · gas used ${receipt.gasUsed}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transaction failed');
    }
  }
  return (
    <main style={{ '--accent': accent } as React.CSSProperties}>
      <header>
        <a className="brand" href="/">
          ◈ ProofPass <span>{appId}</span>
        </a>
        <span className="badge">{EDUCATIONAL_NOTICE}</span>
      </header>
      <div className="hero">
        <span className="eyebrow">PRIVATE CREDENTIALS. VERIFIABLE ACCESS.</span>
        <h1>
          Your identity.
          <br />
          <em>Your control.</em>
        </h1>
        <p>
          Enter {title} with a wallet and a zero-knowledge credential proof. Your document stays on
          your device.
        </p>
      </div>
      <div className="grid">
        <section className="card">
          <div className="card-title">
            <span className="step">01</span>
            <h2>Authenticate</h2>
            <span className="pill">{user ? 'Signed in' : 'Ready to connect'}</span>
          </div>
          {isConnected ? (
            <div className="wallet">
              <span>
                Wallet {address?.slice(0, 8)}…{address?.slice(-6)}
              </span>
              <button className="quiet" onClick={() => disconnect()}>
                Disconnect
              </button>
            </div>
          ) : (
            <button onClick={() => connect({ connector: connectors[0] })}>
              Connect browser wallet
            </button>
          )}
          {walletError && (
            <p role="alert">
              Wallet connection was not completed. Open this app in a browser with a wallet
              extension and check the selected test network.
            </p>
          )}
          <ZkAuthButton
            appId={appId}
            apiUrl={process.env.NEXT_PUBLIC_AUTH_API ?? 'http://localhost:4000'}
            onAuthenticated={authenticated}
            onProof={(p, c) => setProof({ p, c })}
          />
          {user && (
            <div className="success">
              <strong>Access granted to {title}</strong>
              <p>
                Application subject: <code>{user.sub}</code>
              </p>
              <p>
                Session wallet: <code>{user.wallet}</code>
              </p>
              <button
                className="quiet"
                onClick={async () => {
                  await fetch('/api/session', { method: 'DELETE' });
                  setUser(null);
                  setProof(undefined);
                }}
              >
                Sign out
              </button>
            </div>
          )}
        </section>
        <aside className="card">
          <span className="eyebrow">WHAT IS PROVEN</span>
          <h2>
            Reveal less.
            <br />
            Verify what matters.
          </h2>
          <ul className="claims">
            <li>✓ Valid synthetic signed credential</li>
            <li>✓ {AGE_POLICY}</li>
            <li>✓ Control of the connected wallet</li>
          </ul>
          <p>
            Name, date of birth, address, photograph, and Aadhaar number are not sent to the
            authentication API.
          </p>
          <p className="muted">
            Credential possession does not establish rightful ownership. This demo does not prove
            citizenship or universal person uniqueness.
          </p>
          <a
            className="text-link"
            href={appId === 'demo-a' ? 'http://localhost:3001' : 'http://localhost:3000'}
          >
            Open {appId === 'demo-a' ? 'Campus Library' : 'Student Lab'} ↗
          </a>
          <p className="muted">Each application has its own subject identifier and session.</p>
        </aside>
      </div>
      <section className="card transaction">
        <h2>Optional blockchain transaction</h2>
        <p>
          Login uses a contract read call and needs no gas. Publishing this demonstration sends the
          proof and public inputs to the blockchain, where they become public and linkable to your
          wallet.
        </p>
        <button disabled={!proof || chainId !== proof.c.chainId} onClick={publish}>
          Publish proof demonstration
        </button>
        {transaction && (
          <p>
            <code>{transaction}</code>
            {proof?.c.chainId === 11155111 && (
              <a
                href={`https://sepolia.etherscan.io/tx/${transaction.split(' ')[0]}`}
                target="_blank"
                rel="noreferrer"
              >
                {' '}
                View on explorer ↗
              </a>
            )}
          </p>
        )}
      </section>
      {error && <p role="alert">{error}</p>}
      <footer>
        ProofPass · College project · Anon Aadhaar + EVM verification · Test credentials only
      </footer>
    </main>
  );
}
