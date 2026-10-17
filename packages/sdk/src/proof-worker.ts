import {
  generateArgs,
  init,
  prove,
  ArtifactsOrigin,
  packGroth16Proof,
  testPublicKeyHash,
} from '@anon-aadhaar/core';
// Limit the upstream prover's worker fan-out inside this isolated worker only.
// A large reported CPU count otherwise creates excessive memory pressure on laptops.
Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4, configurable: true });
self.onmessage = async (
  event: MessageEvent<{
    qrData: string;
    certificate: string;
    seed: string;
    signal: string;
    wasm: string;
    zkey: string;
    vkey: string;
  }>,
) => {
  try {
    const m = event.data;
    await init({
      wasmURL: m.wasm,
      zkeyURL: m.zkey,
      vkeyURL: m.vkey,
      artifactsOrigin: ArtifactsOrigin.server,
    });
    const args = await generateArgs({
      qrData: m.qrData,
      certificateFile: m.certificate,
      nullifierSeed: BigInt(m.seed),
      signal: m.signal,
      fieldsToRevealArray: ['revealAgeAbove18'],
    });
    const result = await prove(args, (status) => self.postMessage({ status }));
    const p = result.proof;
    if (p.pubkeyHash !== testPublicKeyHash) throw new Error('TEST_KEY_REQUIRED');
    self.postMessage({
      proof: {
        nullifierSeed: p.nullifierSeed,
        nullifier: p.nullifier,
        timestamp: p.timestamp,
        signal: m.signal,
        reveal: [p.ageAbove18, p.gender, p.pincode, p.state],
        groth16: packGroth16Proof(p.groth16Proof).map(String),
      },
    });
  } catch {
    self.postMessage({ error: 'PROOF_GENERATION_FAILED' });
  }
};
