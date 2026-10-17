# Student access validation

The active policy is college-authorized enrollment, verified issuance code and wallet, and an unexpired student credential. Age-only assertions and legacy sessions cannot authorize materials.

Validated on Windows with Node 24.16.0, Circom 2.2 (circom2 0.2.23), circomlib 2.0.5, circomlibjs 0.1.7, snarkjs 0.7.6, Tesseract.js 7.0.0, Solidity 0.8.28 and Next.js 15.5.28.

## Measurements

- A real student proof, including local artifact loading and verification, took **1.93 seconds** in Node on this machine. This is an observation, not a browser guarantee.
- The circuit has 3,323 nonlinear and 3,382 linear constraints, five public inputs, two public outputs and nineteen private inputs (including paths).
- The optional local contract demonstration consumed **265,387 gas** in the contract fixture test. Browser proof calldata can differ slightly in gas. This is not a currency fee or Sepolia estimate.
- The latest complete Chrome student walkthrough took **18.2 seconds**, with test setup bringing total runner time to 23.1 seconds. Compilation/cache state affects timing.

## Coverage

The **23 passing unit/integration tests** include aggregate cases for:

- Active roster matching; unknown, expired and inactive enrollment; mismatched email/expiry; unauthorized origins; disabled delivery configuration.
- Issuance code mismatch, five-attempt lockout, expiry, single-use consumption and wallet mismatch. No email is sent in these tests.
- Application scope, wallet, root, access deadline and challenge signal; invalid proofs; verifier outages; expired challenges; replay and concurrent submission.
- Roster expiry changes removing old credentials from the approved registry.
- Signed JWT signature/audience/environment/student policy/access deadline; atomic assertion redemption; application-isolated HttpOnly sessions.
- Protected material bytes/headers, missing/expired/wrong-application sessions, changed roots and unavailable registry checks.
- Actual circuit constraint rejection for changed roll hash, expiry, wallet, secret, siblings, nonbinary directions and root. Authorized expiry equal to the public access deadline is accepted; one second below fails.

The **15 passing contract tests** include five student tests: actual proof acceptance, tampered public inputs/proof rejection, college-only root updates, wallet-bound demonstration transactions and revocation. Ten historical Aadhaar contract tests remain.

The Chrome walkthrough covers local ID-photo OCR, test-mailbox issuance, credential download/reuse, fresh proofs for both applications, different subjects, cross-application assertion rejection, protected PDF/slide retrieval, optional transaction, registry mismatch and revocation, logout, unknown enrollment rejection and a 390px layout check.

Inspected proof requests contain only challenge ID, wallet signature and proof. No ID image, roll, email, expiry or secret is sent in those requests. Initial enrollment verification intentionally sends roll, expiry and email to the college issuer, but no photo or secret.

Service tests inject the verifier to isolate policy; they use real wallet signatures and PostgreSQL via PGlite. The unit adapter skips the production advisory lock because it has one connection. Circuit and contract tests use real proofs; browser issuance exercises the deployed local chain and database.

## Limits

Synthetic records, non-deliverable sample emails and a private filesystem mailbox simulate enrollment. Real email delivery and real college identity are not established. The updater uses an unlocked local Hardhat account; the student issuer refuses real networks.

The custom circuit and single-machine educational ceremony are unaudited. The proving key passed snarkjs zkey verify against the circuit and ceremony. Source, generated verifier and public artifact hashes are committed. Keys, witnesses, private credentials, codes, database contents and supplied course documents are ignored. Regenerating the setup requires redeploying the matching verifier.

PostgreSQL and blockchain updates cannot be atomic together. Root mismatch denies access and requires administrator resynchronization. Registry changes invalidate all old-root sessions. Cards must remain valid for the full eight-hour access window. Already downloaded files cannot be revoked.

Sepolia student deployment and SMTP delivery have not been performed. Historical Aadhaar measurements and instructions are archived in legacy-aadhaar.md; they are not the current access policy.
