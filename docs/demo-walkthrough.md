# Student demonstration walkthrough

Explain it as: “The college first checks that I am enrolled and can receive a code at my registered email. My browser then proves I hold a valid college-approved credential, without sending my roll number or ID photo to the library.”

The default local test mailbox simulates delivery. To send real codes, configure Gmail SMTP and register a real recipient in the local roster using the README's real email instructions. Never commit the recipient's address or app password in fixture files.

## Show the flow

1. Open Student Lab on port 3000 and connect a wallet on chain 31337.
2. Download/select the sample ID image. Watch local OCR fill roll CSE2026001 and expiry 2027-06-30. Explain that OCR can be corrected and is not trusted evidence.
3. Enter the address registered for the sample student and request a code. In default test mode this is student1@students.example.test; SMTP mode requires a real registered address.
4. In SMTP mode read the code from the registered inbox or Spam folder. In local-test mode use npm run student:mail -- REQUEST_ID. Enter the code and sign issuance.
5. Save the private credential. Explain that its secret never goes to the issuer or library.
6. Generate a real proof, sign the login challenge, and verify it. The backend calls the local Solidity verifier without a login transaction.
7. Open Campus Library on port 3001. It has no session yet. Load the saved credential, generate a fresh proof, and sign in. The application subject is different.
8. Read the PDF and download slides. Direct file routes reject unauthenticated requests.
9. Optionally publish the proof using local test ETH; explain that transaction inputs become public.
10. Revoke the student using npm run student:revoke -- CSE2026001. A previously open session loses server access. Already downloaded files remain usable.

Never put real student records in public fixture files. The issuer/database operator can see roll number, email, expiry and issuance wallet. The library proof does not hide public wallet correlation or establish biometric identity.

## Architecture

Browser image OCR → college enrollment database + test email code → wallet-bound authorized commitment → current Merkle registry root on local blockchain.

Browser private credential + fresh challenge + public membership path → Groth16 proof → auth API → Solidity verifier read → signed assertion → application session → protected material route.

## Sequence diagram

```mermaid
sequenceDiagram
  participant B as Student browser
  participant I as College issuer / API
  participant D as Enrollment database
  participant M as Local test mailbox
  participant C as Local chain
  participant L as Library backend
  B->>B: Read photo locally; review roll and expiry
  B->>I: Roll, expiry, email, wallet, secret commitment
  I->>D: Match approved active record
  I->>M: Write one-time test code
  B->>I: Code and wallet issuance signature
  I->>D: Authorize credential commitment
  I->>C: College updates registry root
  B->>I: Fresh application login challenge
  I-->>B: Root, scope, wallet, deadline, signal
  B->>B: Generate private membership proof
  B->>I: Proof and challenge signature
  I->>C: Read verifier with current approved root
  C-->>I: Valid / invalid
  I-->>B: Five-minute student assertion
  B->>L: Redeem assertion once
  L-->>B: HttpOnly session
  B->>L: Request course material
  L->>I: Check current registry
  I->>C: Confirm current root
  L-->>B: Authorized bytes or deny access
```
