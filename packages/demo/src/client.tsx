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
import { Library } from './library';
import {
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
    <main>
      <header className="site-header">
        <a className="brand" href="/" aria-label="ProofPass home">
          <span className="brand-mark" aria-hidden="true">
            P
          </span>
          ProofPass
        </a>
        <nav aria-label="Applications">
          <a href="http://localhost:3000" aria-current={appId === 'demo-a' ? 'page' : undefined}>
            Student Lab
          </a>
          <a href="http://localhost:3001" aria-current={appId === 'demo-b' ? 'page' : undefined}>
            Campus Library
          </a>
        </nav>
        <span className="environment">College demonstration</span>
      </header>
      <div className="demo-notice">
        <span aria-hidden="true">i</span>
        <span>
          <span>{EDUCATIONAL_NOTICE}</span>. Use the supplied QR files.
        </span>
      </div>
      <div className="workspace">
        <div className="page-heading">
          <p className="section-label">{title} / Access verification</p>
          <h1>{appId === 'demo-b' && user ? 'Campus Library' : 'Verify access'}</h1>
          <p>
            {appId === 'demo-b' && user
              ? 'Your course materials are ready to read and download.'
              : `Use a wallet and a test credential to sign in to ${title}.`}
          </p>
        </div>
        {appId === 'demo-b' && user && <Library authenticated />}
        <div className="workspace-grid">
          <section className="verification-panel" aria-labelledby="verification-title">
            <div className="panel-heading">
              <h2 id="verification-title">{user ? 'Your session' : 'Access request'}</h2>
              <span className={user ? 'state-label connected' : 'state-label'}>
                <span aria-hidden="true" />
                {user ? 'Signed in' : isConnected ? 'Wallet connected' : 'Not connected'}
              </span>
            </div>
            <div className="connection-row">
              <div>
                <span className="field-caption">Connected wallet</span>
                {isConnected ? (
                  <div className="wallet">
                    <code>
                      {address?.slice(0, 8)}…{address?.slice(-6)}
                    </code>
                    <span className="network-label">
                      {chainId === 31337
                        ? 'ProofPass Local'
                        : chainId === 11155111
                          ? 'Sepolia'
                          : 'Select a test network'}
                    </span>
                  </div>
                ) : (
                  <p className="connection-hint">Connect a browser wallet to begin.</p>
                )}
              </div>
              {isConnected ? (
                <button className="quiet" onClick={() => disconnect()}>
                  Disconnect
                </button>
              ) : (
                <button onClick={() => connect({ connector: connectors[0] })}>
                  Connect browser wallet
                </button>
              )}
            </div>
            {walletError && (
              <p className="inline-error" role="alert">
                Wallet connection was not completed. Check your browser wallet and selected network.
              </p>
            )}
            <div hidden={!!user}>
              <ZkAuthButton
                appId={appId}
                apiUrl={process.env.NEXT_PUBLIC_AUTH_API ?? 'http://localhost:4000'}
                onAuthenticated={authenticated}
                onProof={(p, c) => setProof({ p, c })}
              />
            </div>
            {user && (
              <div className="success">
                <span className="result-mark" aria-hidden="true">
                  ✓
                </span>
                <strong>Access granted to {title}</strong>
                <p>Your credential proof was accepted. This session lasts up to eight hours.</p>
                <dl>
                  <div>
                    <dt>Application subject</dt>
                    <dd>
                      <code>{user.sub}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Session wallet</dt>
                    <dd>
                      <code>{user.wallet}</code>
                    </dd>
                  </div>
                </dl>
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
            <div className="panel-footnote">
              Your credential is read on this device. The file is not uploaded.
            </div>
          </section>
          <aside className="verification-notes">
            <p className="section-label">Before you begin</p>
            <h2>What gets verified</h2>
            <p>
              The application checks a few facts without receiving your credential's personal
              details.
            </p>
            <dl className="requirements">
              <div>
                <dt>Credential</dt>
                <dd>A synthetic QR signed with the accepted test key.</dd>
              </div>
              <div>
                <dt>Age requirement</dt>
                <dd>Completed age greater than 18 (19+), at the QR signing date.</dd>
              </div>
              <div>
                <dt>Wallet</dt>
                <dd>A signature confirming control of your connected address.</dd>
              </div>
            </dl>
            <div className="privacy-note">
              <h3>What stays private</h3>
              <p>
                Name, date of birth, address, photograph, and Aadhaar number. Your wallet address
                and proof inputs remain visible.
              </p>
            </div>
            <details className="scope-note">
              <summary>What this demo does not establish</summary>
              <p>
                It does not verify college enrollment, citizenship, rightful credential ownership,
                or universal person uniqueness.
              </p>
            </details>
            <a
              className="text-link"
              href={appId === 'demo-a' ? 'http://localhost:3001' : 'http://localhost:3000'}
            >
              Try {appId === 'demo-a' ? 'Campus Library' : 'Student Lab'}{' '}
              <span aria-hidden="true">↗</span>
            </a>
            <p className="small-note">Each application has a separate identifier and session.</p>
          </aside>
        </div>
        {appId === 'demo-b' && !user && <Library authenticated={false} />}
        <section className="transaction" aria-labelledby="transaction-title">
          <div>
            <p className="section-label">Optional / After verification</p>
            <h2 id="transaction-title">Record a proof on the local chain.</h2>
            <p>
              Normal login has no transaction fee. Publishing a demonstration requires test ETH and
              makes the proof inputs public, linked to your wallet.
            </p>
          </div>
          <button
            className="quiet"
            disabled={!proof || chainId !== proof.c.chainId}
            onClick={publish}
          >
            Publish proof demonstration
          </button>
          {transaction && (
            <p className="transaction-result">
              <code>{transaction}</code>
              {proof?.c.chainId === 11155111 && (
                <a
                  href={'https://sepolia.etherscan.io/tx/' + transaction.split(' ')[0]}
                  target="_blank"
                  rel="noreferrer"
                >
                  View on explorer ↗
                </a>
              )}
            </p>
          )}
        </section>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <footer>
        <span>
          ProofPass <span aria-hidden="true">/</span> {title}
        </span>
        <span>Zero-knowledge authentication · Test credentials only</span>
      </footer>
    </main>
  );
}
