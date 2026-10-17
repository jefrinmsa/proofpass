# Validation record

Validated locally on Windows with Node 24.16.0, Anon Aadhaar core/contracts 2.4.3, v2.0.0 artifacts, Solidity 0.8.28, and Next.js 15.5.28.

## Real proof measurements

These measurements use the published circuit and proving key, with synthetic RSA-signed QR credentials. Timings cover local artifact loading, proving and verification in Node; they are not browser performance guarantees.

| Fixture             | Valid Groth16 proof | Age flag | Measured seconds | Authentication policy |
| ------------------- | ------------------- | -------- | ---------------: | --------------------- |
| Adult               | Yes                 | 1        |            30.30 | Accept                |
| Underage            | Yes                 | 0        |            24.68 | Reject                |
| Eighteenth birthday | Yes                 | 0        |            28.82 | Reject                |
| Nineteenth birthday | Yes                 | 1        |            29.14 | Accept                |

All four proofs were also passed to the Solidity verifier. Altered signal inputs were rejected. The optional local `demonstrate` transaction used 282,507 gas for the adult fixture and 282,483 for the nineteenth-birthday fixture. These are observed local EVM gas units, not Sepolia fee estimates. Wrapper deployment used 259,248 gas; its dependent verifier deployments are additional.

## Automated coverage

Final acceptance: **20 unit/integration tests, 10 contract tests, and the full Chrome browser walkthrough passed.** The browser walkthrough completed in approximately 1.7 minutes, including three real browser proofs, both application sessions, an optional local transaction, underage rejection, logout isolation and a 390 px mobile layout check. API request inspection found no credential files or QR payloads. The final browser prover uses an isolated worker with parallelism capped at four; an earlier uncapped run timed out under memory pressure and is not counted as successful.

- API/service tests use actual wallet signatures and an injected unit-test verifier to isolate challenge policy. They cover eligible/ineligible flags, expiry, replay, concurrent consumption, altered signals, wrong app seed/origin/network/wallet, extra disclosures, verifier failure and outage, request envelopes, and error redaction.
- Assertion tests check signed JWTs, audience, expiry, environment and age claims.
- Database integration runs the SQL schema on an embedded PostgreSQL engine and checks atomic challenge consumption, assertion redemption, HttpOnly session creation, app isolation and logout.
- Contract tests exercise the actual published verifier, all four real proofs, malformed proofs, policy failures, and key mismatches.
- Both Next.js production builds completed. The server build reports an upstream optional `web-worker` dynamic-dependency warning; browser snarkjs is explicitly resolved to its browser build.

The real proof outputs, local deployments and generated signing keys are ignored under `.local/` and `deployments/`. Public fixture data and certificates are included. Pinned public-artifact hashes are under `scripts/artifact-hashes.json`.

Sepolia deployment requires a supplied RPC URL and funded testnet key and has not been performed. This is an educational implementation, not a production audit.
