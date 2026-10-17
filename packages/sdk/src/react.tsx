'use client';
import React, { useEffect, useRef, useState } from 'react';
import { artifactUrls } from '@anon-aadhaar/core';
import { useAccount, useSignMessage } from 'wagmi';
import { ZkAuthClient, type AuthProof, type Challenge } from './index';
import { proofSchema, AGE_POLICY } from '@zk-auth/shared';
import jsQR from 'jsqr';
export { StudentAuthButton } from './student-react';
export function ZkAuthButton({
  apiUrl,
  appId,
  onAuthenticated,
  onProof,
}: {
  apiUrl: string;
  appId: string;
  onAuthenticated: (assertion: string) => Promise<void>;
  onProof?: (p: AuthProof, c: Challenge) => void;
}) {
  const { address, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [challenge, setChallenge] = useState<Challenge>();
  const [signature, setSignature] = useState<string>();
  const [file, setFile] = useState<File>();
  const [proof, setProof] = useState<AuthProof>();
  const [status, setStatus] = useState('Connect a wallet to begin.');
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const workerRef = useRef<Worker>();
  useEffect(() => {
    generation.current++;
    workerRef.current?.terminate();
    setBusy(false);
    setChallenge(undefined);
    setSignature(undefined);
    setProof(undefined);
    setFile(undefined);
    return () => {
      generation.current++;
      workerRef.current?.terminate();
    };
  }, [address, chainId]);
  async function begin() {
    if (!address) return;
    const attempt = ++generation.current;
    setBusy(true);
    setProof(undefined);
    setFile(undefined);
    try {
      const c = await new ZkAuthClient(apiUrl, appId).challenge(address);
      if (chainId !== c.chainId)
        throw new Error(`WRONG_NETWORK: switch wallet to chain ${c.chainId}`);
      const sig = await signMessageAsync({ message: c.message });
      if (attempt !== generation.current) return;
      setSignature(sig);
      setChallenge(c);
      setStatus('Wallet signed. Choose an adult.png or adult.txt test credential.');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Unable to start');
    } finally {
      setBusy(false);
    }
  }
  async function generate() {
    if (!file || !challenge) return;
    const attempt = generation.current;
    setBusy(true);
    try {
      if (file.size > 5000000) throw new Error('Fixture is too large');
      let qrData: string;
      if (file.type.startsWith('image/')) {
        const image = await createImageBitmap(file);
        try {
          if (image.width * image.height > 16000000) throw new Error('Image dimensions too large');
          const canvas = document.createElement('canvas');
          canvas.width = image.width;
          canvas.height = image.height;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(image, 0, 0);
          qrData =
            jsQR(
              ctx.getImageData(0, 0, canvas.width, canvas.height).data,
              canvas.width,
              canvas.height,
            )?.data ?? '';
        } finally {
          image.close();
        }
      } else {
        qrData = (await file.text()).trim();
      }
      if (!/^[0-9]{1,16000}$/.test(qrData))
        throw new Error('Choose a generated synthetic QR PNG or payload TXT');
      const cert = await fetch('/testCertificate.pem').then((r) => {
        if (!r.ok) throw new Error('Run fixtures:generate first');
        return r.text();
      });
      const local = process.env.NEXT_PUBLIC_LOCAL_ARTIFACTS === 'true';
      const start = performance.now();
      const worker = new Worker(new URL('./proof-worker.js', import.meta.url), { type: 'module' });
      workerRef.current = worker;
      const result = await new Promise<unknown>((resolve, reject) => {
        const timeout = setTimeout(() => {
          worker.terminate();
          reject(new Error('PROOF_TIMEOUT'));
        }, 240000);
        worker.onerror = () => {
          clearTimeout(timeout);
          worker.terminate();
          reject(new Error('PROOF_GENERATION_FAILED'));
        };
        worker.onmessage = (event) => {
          if (event.data.status) {
            if (attempt === generation.current)
              setStatus(`Proof generation: ${event.data.status}. Keep this tab open.`);
            return;
          }
          clearTimeout(timeout);
          worker.terminate();
          event.data.proof
            ? resolve(event.data.proof)
            : reject(new Error('PROOF_GENERATION_FAILED'));
        };
        worker.postMessage({
          qrData,
          certificate: cert,
          seed: challenge.nullifierSeed,
          signal: challenge.signal,
          wasm: new URL(local ? '/zk/aadhaar-verifier.wasm' : artifactUrls.v2.wasm, location.origin)
            .href,
          zkey: new URL(local ? '/zk/circuit_final.zkey' : artifactUrls.v2.zkey, location.origin)
            .href,
          vkey: new URL(local ? '/zk/vkey.json' : artifactUrls.v2.vk, location.origin).href,
        });
      });
      if (attempt !== generation.current) return;
      const parsed = proofSchema.parse(result);
      setProof(parsed);
      setFile(undefined);
      setStatus(
        `Proof generated in ${((performance.now() - start) / 1000).toFixed(1)} seconds, including artifact loading. Ready to verify.`,
      );
    } catch {
      if (attempt === generation.current)
        setStatus(
          'PROOF_GENERATION_FAILED: check the synthetic fixture, artifact availability, and browser memory.',
        );
    } finally {
      if (attempt === generation.current) setBusy(false);
    }
  }
  async function finish() {
    if (!proof || !challenge || !signature) return;
    setBusy(true);
    try {
      const { assertion } = await new ZkAuthClient(apiUrl, appId).verify(
        challenge.id,
        signature,
        proof,
      );
      await onAuthenticated(assertion);
      onProof?.(proof, challenge);
      setStatus('Authenticated with a contract read call. No transaction fee.');
      setChallenge(undefined);
      setSignature(undefined);
      setProof(undefined);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Verification failed');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-flow">
      <p className="policy">Age rule: {AGE_POLICY}. Your date of birth stays private.</p>
      <div className="flow-step">
        <span className="flow-number">01</span>
        <div className="flow-body">
          <h3>Sign a login request</h3>
          <p>Confirm a one-time message in your wallet. No payment is required.</p>
          <button disabled={!address || busy} onClick={begin}>
            {challenge ? 'Restart challenge' : '1. Sign login challenge'}
          </button>
        </div>
      </div>
      <fieldset
        className="flow-step proof-step"
        disabled={!challenge || !signature || busy}
        key={challenge?.id ?? 'no-challenge'}
      >
        <span className="flow-number">02</span>
        <div className="flow-body">
          <h3>Generate a credential proof</h3>
          <p>
            Choose a supplied test QR image or text file. Proof generation happens on your device
            and may take a minute.
          </p>
          <label>
            Synthetic QR credential
            <input
              type="file"
              accept=".txt,.png,.jpg,.jpeg"
              onChange={(e) => {
                setFile(e.target.files?.[0]);
                setProof(undefined);
              }}
            />
          </label>
          <button disabled={!file || busy} onClick={generate}>
            Generate private proof
          </button>
          {challenge && (
            <p className="expiry">
              Request expires at {new Date(challenge.expiresAt).toLocaleTimeString()}
            </p>
          )}
        </div>
      </fieldset>
      <div className="flow-step">
        <span className="flow-number">03</span>
        <div className="flow-body">
          <h3>Verify and sign in</h3>
          <p>Check the proof and create a session for this application.</p>
          <button disabled={!proof || busy} onClick={finish}>
            3. Verify proof and sign in
          </button>
        </div>
      </div>
      <p role="status" className="status">
        {status}
      </p>
    </div>
  );
}
