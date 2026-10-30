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
- Gmail SMTP accepted the verification email for the authorized demo recipient. Completing the email-code and proof walkthrough requires the recipient's fresh code.
- Supabase has seven application tables with row-level security enabled and no anonymous/authenticated table privileges. Cloud enrollment data is separate from local development data.
- The public artifact bucket contains the existing matching circuit artifacts and OCR assets. The course-material bucket is private: public downloads are denied, authorized signed downloads match the original local PDF and presentations, and storage cache control is zero.
- Server-side PostgreSQL connections verify the Supabase certificate using the official Supabase root CA. Signing keys, the OTP hashing secret, SMTP credentials, storage credentials and the registry-owner key are hosting secrets.
- Sampled website entry scripts contain none of the configured hosting secrets. Private local configuration, keys and materials are excluded from the deployment upload and Git.

Sepolia contract addresses, deployment transactions and measured deployment gas are recorded in [sepolia-deployment.md](sepolia-deployment.md). Login verifies through a contract read call; credential issuance updates the registry with a Sepolia transaction.

## Remaining validation

Complete the recipient-assisted cloud login walkthrough, including proof generation, application isolation, assertion replay rejection and session-authorized material downloads. A separate device with MetaMask should also be used for the final presentation rehearsal. Automated browser wallet signatures do not test the MetaMask extension interface.

The private download URL lifetime is 60 seconds. An already issued URL can work until it expires, and downloaded copies cannot be revoked. This is a synthetic enrollment demonstration, not an audited production identity service.
