# College demonstration: 8–10 minutes

1. Explain the problem: an app should learn an eligibility claim without collecting a copy of an identity document. Show the “Test credentials” banner and clarify that the circuit's claim is completed age >18 at QR signing, not a claim of citizenship.
2. Show `fixtures/adult.png`. It is a synthetic signed QR generated with a public test key, containing no resident data. Show the QR file input: decoding and proving happen locally in the browser.
3. Connect a development wallet on chain 31337. Sign the challenge and show the wallet message binding the app, origin, address, chain, verifier, nonce, expiry and seed.
4. Generate the adult proof. Explain private witness versus public inputs while it runs. Do not show real documents or claim production-grade identity assurance.
5. Verify and sign in to Student Lab. In browser network tools, inspect `/v1/auth/verify`: it contains proof coordinates, public signals and a wallet signature, not the document or DOB. Show the eight-hour HttpOnly session cookie and explain the five-minute assertion exchange.
6. Open Campus Library. It starts signed out. Authenticate with the same synthetic QR and wallet. Compare application subject identifiers: different application seeds produce different identifiers. Explain that using the same public wallet can still link activity.
7. Sign out of Campus Library, return to Student Lab and show that its session remains active. Each backend checks its audience and redeems assertions once.
8. Restart login with `underage.png` or `eighteenth-birthday.png`. A proof can be cryptographically valid while its age result fails the application's policy. Show the `AGE_REQUIREMENT_NOT_MET` error. The nineteenth-birthday fixture should pass.
9. Optionally publish an adult proof to the local blockchain. Explain that normal login needed no gas, whereas this explicit demonstration makes its transaction inputs public. Show the transaction hash and gas used. Sepolia runs can open an explorer link.
10. Show test results for challenge expiry, replay, concurrent redemption, wallet mismatch, altered signals, different apps, invalid proofs and RPC outages. End by explaining the trust boundary: the service issues sessions, and credential possession alone does not identify the rightful holder.

Before presenting: start database, chain, API and both apps; check wallet network; pre-download artifacts; regenerate synthetic fixtures for the presentation date; keep browser memory available. If proving exceeds five minutes, obtain a fresh challenge and try again. Browser performance is hardware-dependent.
