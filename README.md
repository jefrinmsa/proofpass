# ProofPass: private student access

For hosting the complete demo independently of your computer, follow [the Vercel, Supabase and Sepolia deployment guide](docs/cloud-deployment.md).

College demonstration using ID-photo OCR, a registered-email verification step, wallet signatures, real Groth16 enrollment proofs, and a local blockchain verifier. Only enrolled students with a valid credential can open the protected Campus Library materials. **The active application has no age requirement.** The original Aadhaar demo is retained as legacy source; its assertions and sessions cannot unlock student resources.

**Test credentials — educational demonstration.** The roster is synthetic. Email delivery supports Gmail/other SMTP servers or an explicit local test mailbox. The local mailbox does not prove real email ownership. Real enrollment imports, production issuer custody, an audited circuit and an independent trusted setup are not implemented.

## What happens

1. Connect the student's wallet on ProofPass Local, chain 31337.
2. Select a student ID photo. Tesseract reads its text in the browser. Review or correct the roll number and expiry date.
3. Submit those fields and the registered email to the college issuer. It matches the active enrollment record and exact expiry, then delivers a one-time code through the configured SMTP sender or explicit local test mailbox.
4. Enter the code and sign the issuance message. The issuer authorizes a wallet-bound enrollment commitment and updates the college registry root on the local chain. The browser retains the secret credential; the secret is never sent to the issuer.
5. The browser generates a fresh ZK membership proof for the application and login challenge. The roll number and card expiry are private circuit inputs.
6. The backend checks the signature, challenge, application scope, wallet, current root, and proof through a contract read call. Successful verification produces a five-minute signed assertion.
7. The application's backend redeems the assertion once for an HttpOnly session, bounded by the proved access deadline and eight hours. Each protected material request checks the current registry; revoked or stale sessions cannot download files.

ZK proofs are mathematical evidence, not encrypted documents. An ID photo or OCR output alone cannot establish authenticity. Enrollment records and the registered-email step authorize issuance. This does not establish biometric identity or that a printed photo is genuine.

## Privacy and trust

| Data                                                                      | Where it goes                                                                               |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| ID image and OCR text                                                     | Browser only; no image upload or external OCR service                                       |
| Roll number, expiry, registered email                                     | College issuer during enrollment verification; stored in its roster/pending issuance record |
| Credential secret                                                         | Browser memory and optional user-downloaded private JSON; never sent to the backend         |
| Wallet and salted enrollment commitment                                   | Issuer database; only the aggregate registry root is published by registry updates          |
| Proof, application nullifier, root, wallet, access deadline, login signal | Authentication service and contract read call                                               |
| Subject and session claims                                                | Application backend; no roll number, email or card expiry                                   |
| Optional demonstration transaction                                        | Proof/public inputs become public and linked to the wallet                                  |

The issuer already knows the enrollment record and wallet during issuance. The library does not learn the private fields from the proof, but this deployment shares an operator/database, so it does not claim privacy against that operator or complete anonymity. Public wallet addresses also permit correlation between apps.

## Run locally (Windows PowerShell)

Use Node 22 or 24 and Chrome. Start from the repository root. Do not commit .env, .local, private credentials, mailbox files, or course documents.

Install and build the shared package:

    npm.cmd ci
    Copy-Item .env.example .env
    npm.cmd run build -w @zk-auth/shared
    npm.cmd run keys:generate

Start the database in one terminal:

    npm.cmd run db:local

Start the blockchain in another terminal (keep this terminal running):

    npm.cmd run chain

The commands below retain both local verifier deployments for compatibility. Student-only hosting does not require the legacy verifier; set `ENABLE_LEGACY_AADHAAR=false`. The large Aadhaar proving artifacts are unnecessary for student login.

    npm.cmd run deploy:local
    npm.cmd run configure:local -- --embedded
    npm.cmd run student:setup
    npm.cmd run student:ocr
    npm.cmd run student:deploy
    npm.cmd run student:configure
    npm.cmd run db:migrate
    npm.cmd run app:register -- demo-a http://localhost:3000
    npm.cmd run app:register -- demo-b http://localhost:3001
    npm.cmd run student:seed
    npm.cmd run student:card
    npm.cmd run build -w @zk-auth/shared
    npm.cmd run build -w @zk-auth/sdk

student:setup compiles Circom 2.2, creates a local educational ceremony with random contributions, verifies the proving key, generates the Solidity verifier and copies public proving artifacts to both apps. Regenerating it changes the verification key: redeploy and reconfigure the student contract, resynchronize the registry, then restart the API. The single-machine ceremony and circuit have not been independently audited. It is not a production setup.

student:ocr downloads the public English language model once, then serves the OCR worker/core/model from the local apps. No student image is sent to that download host. Asset hashes are recorded in scripts/ocr-artifact-hashes.json; student proving hashes are in scripts/student-artifact-hashes.json.

Run each server in its own terminal:

    npm.cmd run dev:api
    npm.cmd run dev:a
    npm.cmd run dev:b

Open Student Lab at http://localhost:3000 and Campus Library at http://localhost:3001. Production builds use npm.cmd run build; start each app with npm.cmd run start -w @zk-auth/demo-a (or demo-b).

Configure MetaMask's local test network: RPC http://127.0.0.1:8545, chain ID 31337, symbol ETH. Normal login needs no transaction fee. The optional transaction uses local test ETH; never send real funds to development accounts. Local issuance uses an explicitly enabled unlocked Hardhat account. Hosted issuance requires Sepolia, a dedicated registry-owner signing key and the cloud configuration in the deployment guide.

## Try the sample student

Download the sample ID photo from the login screen, or select fixtures/student-card.png. OCR should read:

    Roll number: CSE2026001
    Card expiry date: 2027-06-30
    Registered email: student1@students.example.test

Request a code. The page shows the request ID. In an administrator terminal, run:

    npm.cmd run student:mail -- REQUEST_ID

Enter the six-digit code in the page, verify and sign with the wallet, save the private credential JSON, generate the proof, then choose Verify proof and sign in. Use the saved credential with the same wallet in the other app to avoid issuing a replacement. Every login requires a fresh proof and wallet signature.

The sample roster is fixtures/student-roster.json. CSE2025003 is expired; CSE2026004 is inactive. Unknown roll numbers, changed expiry dates, and unregistered email addresses are rejected. These fixtures are examples, not an existing college student database.

The date printed on a card is treated as inclusive through 23:59:59 UTC. The circuit requires authorized expiry >= the server-issued eight-hour access deadline; cards expiring sooner cannot start that session. Device time cannot extend validity. The contract also bounds the public access deadline against its block time.

Codes last ten minutes, allow at most five confirmation attempts, and can issue only once. Restarting the API invalidates pending codes because their hash pepper is process-local. No public endpoint exposes mailbox codes. Requests are limited per IP and to five per recipient in fifteen minutes. Failed or ambiguous sends invalidate the pending request; SMTP never falls back to the local test mailbox.

## Real Gmail delivery

1.  Enable Google 2-Step Verification and create an app password at https://myaccount.google.com/apppasswords while signed into the sender account. Use the generated app password rather than your normal Google password or a six-digit code. See https://support.google.com/accounts/answer/185833.
2.  Save only that app password in `.local/gmail-app-password.txt`. This folder is ignored by Git. Never paste secrets into chat, fixtures, browser code or public environment variables.
3.  Configure these server-only fields in `.env`:

    EMAIL_DELIVERY=smtp
    SMTP_HOST=smtp.gmail.com
    SMTP_PORT=465
    SMTP_USER=your-sender@gmail.com
    SMTP_FROM=your-sender@gmail.com
    SMTP_PASSWORD_FILE=.local/gmail-app-password.txt

4.  Register the real recipient against an approved sample enrollment:

        npm.cmd run student:email -- CSE2026001 recipient@example.com

    This modifies only the local database. It removes the previous credential and pending issuance requests so the new address must be verified. It also synchronizes the registry root. The public fixture roster retains fake addresses. A Gmail recipient on a synthetic record demonstrates inbox access; it does not establish real college enrollment.

5.  Run `npm.cmd run student:mail:check` to verify SMTP connectivity and authentication without sending email. Restart the API after changing `.env` and refresh the page. The form displays SMTP delivery status.
6.  Enter the email registered in step 4, request a code and check that inbox and Spam folder. There is no local JSON copy of SMTP codes. A provider accepting a message does not guarantee inbox delivery.

SMTP uses TLS with certificate validation (465 implicit TLS or 587 required STARTTLS). The OS resolver supplies the server IP; the original hostname is retained for TLS SNI and certificate validation. Credentials and raw SMTP traffic are not logged. Email contains only the verification code, request ID and explanatory text, with no ID image, roll, card expiry, wallet or credential secret. Configuration discovery exposes only delivery mode and whether required settings are present, not credentials or a guarantee of successful provider authentication.

Use `EMAIL_DELIVERY=local-test` and restart the API to return to the explicit test mailbox. That mode accepts only `@students.example.test`; SMTP rejects `.test` recipients. Browser walkthroughs are run in local-test mode and never send real messages. After assigning a real recipient to CSE2026001, use a separate test database or temporarily restore its fake address before those walkthroughs; re-register the real address afterward.

## Revocation and registry changes

    npm.cmd run student:revoke -- CSE2026001

This disables the record and updates the on-chain registry root. Root changes conservatively invalidate all sessions made under the previous root, including after new issuance or credential replacement. Students sign in again using their existing valid credential and a fresh membership path. The tree supports 256 active credentials in this demo.

Each protected request checks database session expiry plus the registry endpoint, which recomputes approved leaves and compares their root with the blockchain. RPC outages, a failed root update, or a database/chain mismatch deny access. A root transaction and database commit are not one atomic operation; mismatch fails closed and an administrator must resynchronize using student:seed. Do not expose Hardhat's unlocked RPC or this local issuer on the public internet.

## Protected materials

Keep the supplied documents in apps/demo-b/.local/library/:

- jefrincn.pdf
- SOFTWARE PROJECT MANAGEMENT AND PROCESS MODELS [Autosaved].pptx
- Agile_Operations_Management.pptx

They are ignored by Git and served only through authenticated allowlisted routes. They are not placed in public/. The catalog and file endpoints reject missing, expired, legacy age-only and stale/revoked student sessions. Downloads already saved by a student cannot be revoked.

## SDK integration

The React entry exports StudentAuthButton. Place it inside WagmiProvider and QueryClientProvider and pass apiUrl, appId and an async onAuthenticated(assertion) handler that posts the assertion to your own backend. An optional onProof callback supports a public transaction demonstration. Keep the exact registered application origin and a different nullifier seed per application.

The server helper createAssertionVerifier from @zk-auth/sdk/server validates RS256 signatures, issuer, exact audience, expiry, environment, studentEnrolled, the student credential policy, registry root, and bounded access deadline. Redeem jti atomically once, store an opaque session token, and check current registry authorization on protected requests. The sample sessionHandlers and readSession show this behavior. Legacy Aadhaar assertions are rejected by this helper.

For JavaScript integrations without React, import StudentAuthClient from @zk-auth/sdk. It exposes requestEnrollment, confirmEnrollment, registry, challenge and verify. Proof generation uses the student circuit worker shown in the React implementation. No API method accepts an ID image or a credential secret.

To reactivate an existing sample enrollment, run npm.cmd run student:activate -- CSE2026001. This also resynchronizes its registry root.

Student endpoints:

- POST /v1/student/enrollment/request: appId, roll, expiry (Unix seconds), email, wallet, secretCommitment
- POST /v1/student/enrollment/confirm: id, code, signature over returned issuance message
- GET /v1/student/registry: current approved commitments and root; no student fields
- GET /v1/student/config: email delivery mode and configuration status; no secrets
- POST /v1/student/challenges: appId, wallet
- POST /v1/student/auth/verify: challengeId, signature, proof
- GET /.well-known/jwks.json: assertion signing-key discovery

Stable failure codes include ENROLLMENT_NOT_VERIFIED, INVALID_EMAIL_CODE, EMAIL_CODE_EXPIRED_OR_LOCKED, EMAIL_SERVICE_NOT_CONFIGURED, WALLET_MISMATCH, WRONG_NETWORK, CHALLENGE_EXPIRED, PROOF_CONTEXT_MISMATCH, INVALID_PROOF, CHALLENGE_USED_OR_EXPIRED, REGISTRY_CHANGED, REGISTRY_UNAVAILABLE and VERIFICATION_UNAVAILABLE. No verification outage grants access.

## Checks and architecture

    npm.cmd run student:validate
    npm.cmd run typecheck
    npm.cmd test
    npm.cmd run contracts:test
    npm.cmd run test:browser

student:validate must run before circuit and contract fixture tests. Browser tests require the running database, local chain, API and both apps. They use an isolated public Hardhat test wallet. Measurements and test limits are in docs/validation.md. The demonstration guide and sequence diagram are in docs/demo-walkthrough.md. Historical Aadhaar instructions are archived in docs/legacy-aadhaar.md and do not describe the active student login policy.

Cryptographic tooling follows the official Circom constraint model (https://docs.circom.io/circom-language/constraint-generation/) and snarkjs Groth16 setup/proving APIs (https://github.com/iden3/snarkjs). This is a locally verified educational implementation, not a security audit.
