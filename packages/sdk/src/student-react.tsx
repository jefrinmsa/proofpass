'use client';
import React, { useEffect, useRef, useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import {
  FIELD,
  studentCredentialSchema,
  studentProofSchema,
  type StudentCredential,
  type StudentChallenge,
  type StudentProof,
} from '@zk-auth/shared';
import { studentCrypto } from '../../shared/src/student-crypto';
import { StudentAuthClient } from './index';

export function StudentAuthButton({
  apiUrl,
  appId,
  onAuthenticated,
  onProof,
  expectedChainId = 31337,
}: {
  apiUrl: string;
  appId: string;
  onAuthenticated: (assertion: string) => Promise<void>;
  onProof?: (p: StudentProof, c: StudentChallenge) => void;
  expectedChainId?: number;
}) {
  const { address, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [roll, setRoll] = useState('');
  const [date, setDate] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [credential, setCredential] = useState<StudentCredential>();
  const [pending, setPending] = useState<{
    id: string;
    message: string;
    credential: StudentCredential;
    emailMode: 'local-test' | 'smtp';
  }>();
  const [challenge, setChallenge] = useState<StudentChallenge>();
  const [signature, setSignature] = useState<string>();
  const [proof, setProof] = useState<StudentProof>();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Connect your wallet, then read your student ID photo.');
  const generation = useRef(0);
  const worker = useRef<Worker>();
  const [provingSeconds, setProvingSeconds] = useState<number>();
  const [mail, setMail] = useState<{
    emailMode: 'local-test' | 'smtp' | 'disabled';
    emailConfigured: boolean;
  }>();
  useEffect(() => {
    let active = true;
    void new StudentAuthClient(apiUrl, appId)
      .config()
      .then((c) => {
        if (active) setMail(c);
      })
      .catch(() => {
        if (active) setMail({ emailMode: 'disabled', emailConfigured: false });
      });
    return () => {
      active = false;
    };
  }, [apiUrl, appId]);
  useEffect(() => {
    generation.current++;
    worker.current?.terminate();
    setBusy(false);
    setCredential(undefined);
    setPending(undefined);
    setChallenge(undefined);
    setProof(undefined);
    setSignature(undefined);
    return () => {
      generation.current++;
      worker.current?.terminate();
    };
  }, [address, chainId]);
  const client = new StudentAuthClient(apiUrl, appId);
  async function task(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'REQUEST_FAILED';
      setStatus(
        message === 'EMAIL_DELIVERY_FAILED'
          ? 'EMAIL_DELIVERY_FAILED: the code could not be sent. Ask the administrator to check the SMTP sender, then try again.'
          : message === 'EMAIL_RATE_LIMITED'
            ? 'EMAIL_RATE_LIMITED: too many code requests for this address. Wait 15 minutes before trying again.'
            : message,
      );
    } finally {
      setBusy(false);
    }
  }
  async function readPhoto(file?: File) {
    if (!file) return;
    await task(async () => {
      if (file.size > 5000000 || !file.type.startsWith('image/'))
        throw new Error('Choose an ID image smaller than 5 MB.');
      setStatus('Reading the image locally. No photo is uploaded.');
      const { createWorker } = await import('tesseract.js');
      const ocr = await createWorker('eng', 1, {
        workerPath: '/ocr/worker.min.js',
        corePath: '/ocr',
        langPath: '/ocr',
        gzip: true,
        cacheMethod: 'none',
      });
      try {
        const image = await createImageBitmap(file);
        try {
          if (image.width * image.height > 16000000) throw new Error('Image is too large');
        } finally {
          image.close();
        }
        const { data } = await ocr.recognize(file);
        const r = data.text.match(/(?:ROLL\s*(?:NO\.?|NUMBER)?\s*[:\-]?\s*)([A-Z0-9-]{3,40})/i);
        const expiry = data.text.match(
          /(?:EXPIRY|EXPIRES|VALID\s*(?:UNTIL|TILL))\s*[:\-]?\s*(\d{4}-\d{2}-\d{2}|\d{2}[\/-]\d{2}[\/-]\d{4})/i,
        );
        if (r) setRoll(r[1].toUpperCase());
        if (expiry) {
          const value = expiry[1];
          setDate(/^\d{4}/.test(value) ? value : value.split(/[\/-]/).reverse().join('-'));
        }
        setStatus(
          'Review the extracted roll number and expiry. Correct any OCR mistakes before requesting a code.',
        );
      } finally {
        await ocr.terminate();
      }
    });
  }
  async function enroll() {
    await task(async () => {
      setPending(undefined);
      setCode('');
      if (!address || chainId !== expectedChainId)
        throw new Error(
          `WRONG_NETWORK: choose ${expectedChainId === 11155111 ? 'Sepolia' : 'ProofPass Local'} (${expectedChainId})`,
        );
      const expiry = Math.floor(Date.parse(date + 'T23:59:59Z') / 1000);
      const secret = (
        BigInt(
          '0x' +
            Array.from(crypto.getRandomValues(new Uint8Array(32)), (v) =>
              v.toString(16).padStart(2, '0'),
            ).join(''),
        ) % FIELD
      ).toString();
      const c = studentCredentialSchema.parse({
        version: 'proofpass-student-v1',
        roll: roll.trim().toUpperCase(),
        expiry,
        wallet: address,
        secret,
      });
      const { hash } = await studentCrypto();
      const response = await client.requestEnrollment({
        roll: c.roll,
        expiry: c.expiry,
        email: email.trim().toLowerCase(),
        wallet: address,
        secretCommitment: hash([secret]),
      });
      setPending({ ...response, credential: c });
      setCode('');
      setCredential(undefined);
      setChallenge(undefined);
      setProof(undefined);
      setStatus(
        response.emailMode === 'smtp'
          ? 'Code submitted to your registered email. Check Inbox and Spam.'
          : `LOCAL TEST MAILBOX — no email sent. Request ${response.id}. Run: npm run student:mail -- ${response.id}`,
      );
    });
  }
  async function confirm() {
    await task(async () => {
      if (!pending) throw new Error('Request a code first');
      const sig = await signMessageAsync({ message: pending.message });
      await client.confirmEnrollment(pending.id, code, sig);
      setCredential(pending.credential);
      setPending(undefined);
      setCode('');
      setStatus('Enrollment verified. Save your private credential, then generate a login proof.');
    });
  }
  async function generate() {
    await task(async () => {
      if (!credential || !address)
        throw new Error('Verify enrollment or load your private credential first.');
      const attempt = generation.current;
      const c = await client.challenge(address);
      if (chainId !== c.chainId) throw new Error('WRONG_NETWORK');
      const sig = await signMessageAsync({ message: c.message });
      const registry = await client.registry();
      setStatus('Generating your enrollment proof locally…');
      const started = performance.now();
      const w = new Worker(new URL('./student-worker.js', import.meta.url), { type: 'module' });
      worker.current = w;
      const p = await new Promise<StudentProof>((resolve, reject) => {
        const timeout = setTimeout(() => {
          w.terminate();
          reject(new Error('PROOF_TIMEOUT'));
        }, 180000);
        w.onerror = () => {
          clearTimeout(timeout);
          w.terminate();
          reject(new Error('PROOF_GENERATION_FAILED'));
        };
        w.onmessage = (e) => {
          clearTimeout(timeout);
          w.terminate();
          if (e.data.proof) {
            try {
              resolve(studentProofSchema.parse(e.data.proof));
            } catch {
              reject(new Error('INVALID_PROOF'));
            }
          } else reject(new Error(e.data.error ?? 'PROOF_GENERATION_FAILED'));
        };
        w.postMessage({
          credential,
          challenge: c,
          leaves: registry.leaves,
          wasm: new URL('/zk/student/student.wasm', location.origin).href,
          zkey: new URL('/zk/student/student.zkey', location.origin).href,
        });
      });
      if (attempt !== generation.current) return;
      setChallenge(c);
      setSignature(sig);
      setProof(p);
      setProvingSeconds((performance.now() - started) / 1000);
      setStatus('Private enrollment proof ready. Verify it to access materials.');
    });
  }
  async function finish() {
    await task(async () => {
      if (!challenge || !proof || !signature) throw new Error('Generate a proof first');
      const r = await client.verify(challenge.id, signature, proof);
      await onAuthenticated(r.assertion);
      onProof?.(proof, challenge);
      setProof(undefined);
      setChallenge(undefined);
      setSignature(undefined);
      setStatus('Student enrollment proof accepted by the contract. Access granted.');
    });
  }
  function save() {
    if (!credential) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(credential, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'proofpass-student-credential.json';
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="auth-flow student-flow">
      <p className="policy">
        Access requires active enrollment and a student card valid for the next eight hours. No age
        requirement.
      </p>
      <fieldset disabled={!address || busy} className="student-fields">
        <legend>01 / Verify enrollment</legend>
        <label>
          Student ID photo
          <input
            aria-label="Student ID photo"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => void readPhoto(e.target.files?.[0])}
          />
        </label>
        <p className="small-note">
          OCR runs on your device. Review the fields below. You can enter them manually if the photo
          is unclear.
        </p>
        <p className="small-note">
          <a href="/student-card.png" download>
            Download sample ID photo
          </a>{' '}
          {mail?.emailMode === 'local-test'
            ? '· Test email: student1@students.example.test'
            : '· Use the email address registered for this sample student.'}
        </p>
        <label>
          Roll number
          <input value={roll} onChange={(e) => setRoll(e.target.value)} placeholder="CSE2026001" />
        </label>
        <label>
          Card expiry date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          Registered college email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Your registered email address"
          />
        </label>
        <p className="small-note">
          These three fields go to the college enrollment service. The ID image stays on your
          device.
        </p>
        <p className="small-note">
          {!mail
            ? 'Checking email delivery…'
            : mail.emailMode === 'smtp'
              ? mail.emailConfigured
                ? 'Email codes are delivered to your registered inbox through SMTP.'
                : 'Email setup is incomplete. The administrator must configure the SMTP sender before requesting codes.'
              : 'Local test mailbox: no real email will be sent.'}
        </p>
        <button onClick={enroll} disabled={!roll || !date || !email || !mail?.emailConfigured}>
          Request verification code
        </button>
        {pending && (
          <>
            <p className="small-note">
              {pending.emailMode === 'smtp'
                ? 'Check your registered email inbox and Spam folder. The code expires in 10 minutes.'
                : `Local test code: run npm run student:mail -- ${pending.id}`}
            </p>
            <label>
              Email verification code
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
            <button onClick={confirm} disabled={!/^\d{6}$/.test(code)}>
              Verify code and issue credential
            </button>
          </>
        )}
      </fieldset>
      <fieldset disabled={!address || busy} className="student-fields">
        <legend>02 / Private credential</legend>
        <p>
          Your credential contains a private secret. Keep it private and use it with the same
          wallet. Reissuing replaces the previous credential.
        </p>
        <label>
          Load a saved student credential
          <input
            type="file"
            accept="application/json,.json"
            onChange={(e) =>
              void task(async () => {
                const f = e.target.files?.[0];
                if (!f || f.size > 8192) throw new Error('Choose a small credential JSON');
                const c = studentCredentialSchema.parse(JSON.parse(await f.text()));
                if (c.wallet.toLowerCase() !== address?.toLowerCase())
                  throw new Error('WALLET_MISMATCH');
                setCredential(c);
                setProof(undefined);
                setChallenge(undefined);
                setStatus('Private credential loaded locally.');
              })
            }
          />
        </label>
        <button className="quiet" onClick={save} disabled={!credential}>
          Save private credential
        </button>
        <button onClick={generate} disabled={!credential}>
          Generate student proof
        </button>
        {provingSeconds !== undefined && (
          <p className="small-note">
            Last proof: {provingSeconds.toFixed(1)} seconds, including artifact loading.
          </p>
        )}
      </fieldset>
      <div className="flow-step">
        <span className="flow-number">03</span>
        <div className="flow-body">
          <h3>Access your materials</h3>
          <p>The backend checks your wallet, fresh login request, and blockchain proof.</p>
          <button disabled={!proof || busy} onClick={finish}>
            Verify proof and sign in
          </button>
        </div>
      </div>
      <p role="status" className="status">
        {busy ? 'Working… ' : ''}
        {status}
      </p>
    </div>
  );
}
