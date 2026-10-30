# Public demo deployment

The educational student demo is hosted independently of the developer's computer.

| Service | Stable public URL |
| --- | --- |
| Campus Library | https://proofpass-library-jefrinmsa.vercel.app |
| Student Lab | https://proofpass-lab-jefrinmsa.vercel.app |
| Authentication API | https://proofpass-api-jefrinmsa.vercel.app |

## Verified cloud checks

- All three production deployments are ready. API health and readiness return HTTP 200; readiness checks the cloud database and configured Sepolia registry.
- Both websites return HTTP 200. Anonymous session checks report no authenticated session, and all three library download routes reject anonymous requests.
- The three proving files served by each website match the pinned artifact hashes. All OCR asset routes return HTTP 200, and the sample card is read locally in the deployed browser walkthrough.
- Gmail SMTP delivered the verification email to the authorized demo recipient. The recipient supplied the fresh code through a private local file; verification and wallet-bound credential issuance succeeded, including the Sepolia registry update.
- The deployed Chrome walkthrough successfully generated real proofs and logged into both applications. Browser proving took 7.557 seconds for Student Lab and 10.654 seconds for Campus Library on this machine; these are measurements, not performance guarantees.
- The same issued credential remained usable after a subsequent Campus Library deployment. Application subjects differ, cross-application assertion exchange is rejected, and reusing a redeemed assertion returns HTTP 409.
- All three course materials downloaded through authenticated session routes. Each route returned a private/no-store HTTP 303 redirect to signed storage; the downloaded bytes matched the original files. Session cookies are Secure and HttpOnly.
- Inspected proof submissions contain only challenge ID, proof and wallet signature, excluding the photo, roll number, email, expiry and credential secret. Unregistered origins and application IDs return HTTP 403.
- Supabase has seven application tables with row-level security enabled and no anonymous/authenticated table privileges. Cloud enrollment data is separate from local development data.
- The public artifact bucket contains the existing matching circuit artifacts and OCR assets. The course-material bucket is private: public downloads are denied, authorized signed downloads match the original local PDF and presentations, and storage cache control is zero.
- Server-side PostgreSQL connections verify the Supabase certificate using the official Supabase root CA. Signing keys, the OTP hashing secret, SMTP credentials, storage credentials and the registry-owner key are hosting secrets.
- Sampled website entry scripts contain none of the configured hosting secrets. Private local configuration, keys and materials are excluded from the deployment upload and Git.

Sepolia contract addresses, deployment transactions and measured deployment gas are recorded in [sepolia-deployment.md](sepolia-deployment.md). Login verifies through a contract read call; credential issuance updates the registry with a Sepolia transaction.

## Remaining validation

The recipient-assisted cloud walkthrough passed on 30 October 2026. The test used a browser wallet provider backed by real signatures from the dedicated Sepolia test wallet. A separate physical device with MetaMask should also be used for the final presentation rehearsal; the automated provider does not test the extension interface.

Negative circuit, enrollment, revocation and service-failure coverage is recorded in [validation.md](validation.md). Forced API cold-start delivery and cloud revocation have not been separately exercised in this public walkthrough; the deployment uses a persistent OTP hashing secret and preserves the existing revocation checks.

The private download URL lifetime is 60 seconds. An already issued URL can work until it expires, and downloaded copies cannot be revoked. This is a synthetic enrollment demonstration, not an audited production identity service.
