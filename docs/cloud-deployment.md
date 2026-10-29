# Full demo deployment: Vercel, Supabase and Sepolia

This is the hosted student-enrollment flow. Legacy Aadhaar contracts are not required. Use the **existing** circuit, proving key and verifier; never run `student:setup` during deployment. A successful website build does not establish that cloud authentication works.

## 1. Private settings

Use a separate free Supabase project, Vercel Hobby projects and a dedicated wallet containing Sepolia test ETH only. From the repository root:

```powershell
npm.cmd ci
npm.cmd run cloud -- init
npm.cmd run cloud -- check
```

Initialization creates `.local/cloud.env`, a separate RSA signing key pair and a persistent OTP hash secret, preserving existing keys. Keep `.local` out of Git and hosting uploads. Never paste secrets into chat or command arguments.

Fill these five settings in the private file:

| Setting                      | Source                                                                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`               | Supabase **Connect → Transaction pooler**, PostgreSQL connection string, port 6543. Replace the password placeholder with the URL-encoded database password. |
| `SUPABASE_URL`               | Supabase project settings: HTTPS project URL.                                                                                                                |
| `SUPABASE_SERVICE_ROLE_KEY`  | Supabase server-only service role key. Never put it in `NEXT_PUBLIC_*`.                                                                                      |
| `RPC_URL`                    | HTTPS Ethereum **Sepolia** RPC endpoint.                                                                                                                     |
| `REGISTRY_OWNER_PRIVATE_KEY` | Dedicated funded Sepolia wallet private key, prefixed with `0x`.                                                                                             |

The database pool uses verified TLS, at most three connections per instance, and no named prepared statements. If needed, set `DATABASE_SSL_CA` to the provider's CA PEM; never disable certificate verification. Hosted migrations enable row-level security and revoke access from Supabase `anon` and `authenticated` roles. The server connection must use a trusted role with the necessary access, such as the project database owner. Browsers never query these tables directly.

Keep `CHAIN_ID=11155111`, `DEPLOYMENT_ENV=cloud`, `EMAIL_DELIVERY=smtp`, and `ENABLE_LEGACY_AADHAAR=false`. Set the approved Gmail sender in `SMTP_USER`/`SMTP_FROM` and its app-password file in `SMTP_PASSWORD_FILE`. Hosting exports replace file references with secret values. Preserve `OTP_HASH_SECRET` across instances and deployments or pending codes become invalid. Preserve the JWT key pair and `JWT_KEY_ID` too.

`NEXT_PUBLIC_RPC_URL` is a separate **browser-visible** Sepolia endpoint. Restrict its provider key to the app origins. Never expose a private provider credential through a public variable.

## 2. Three standalone Vercel projects

Import the GitHub repository three times. Choose standalone projects in the import screen; shared packages are not services.

| Project            | Root          | Framework | Build command                                |
| ------------------ | ------------- | --------- | -------------------------------------------- |
| Campus Library     | `apps/demo-b` | Next.js   | `node ../../scripts/build-vercel.cjs demo-b` |
| Student Lab        | `apps/demo-a` | Next.js   | `node ../../scripts/build-vercel.cjs demo-a` |
| Authentication API | `apps/api`    | Fastify   | `node ../../scripts/build-vercel.cjs api`    |

Use Node 24, installation command `cd ../.. && npm ci --include=dev --workspaces --include-workspace-root`, default framework output directories, and enable **Include source files outside of the Root Directory in the Build Step**. The explicit repository-root installation includes shared build tools as well as the selected application's dependencies. The checked-in `vercel.json` files supply the commands. Fastify uses `src/index.ts` as its Node entrypoint; SMTP sends and registry receipts are awaited before responding. Its framework adapter manages the serverless function, so do not add a `functions.src/index.ts` pattern. See [Fastify on Vercel](https://vercel.com/docs/frameworks/backend/fastify) and [monorepo shared sources](https://vercel.com/docs/monorepos/monorepo-faq).

Record stable production origins in the private cloud file:

```dotenv
ISSUER=https://YOUR-API.vercel.app
NEXT_PUBLIC_STUDENT_LAB_URL=https://YOUR-LAB.vercel.app
NEXT_PUBLIC_LIBRARY_URL=https://YOUR-LIBRARY.vercel.app
NEXT_PUBLIC_RPC_URL=https://YOUR-BROWSER-SEPOLIA-ENDPOINT
```

Use exact HTTPS origins, without paths or trailing slashes. Do not authorize wildcard previews or per-deployment URLs. The production API must be publicly reachable; deployment protection on it would block the browser and application servers. An initial deployment without settings can fail safely; redeploy after configuration.

## 3. Contracts and separate database

```powershell
npm.cmd run cloud -- deploy-contracts
npm.cmd run cloud -- database
```

Contract deployment checks the RPC chain and test balance first, deploys `StudentGroth16Verifier` and `StudentAuth`, and saves the address privately. It refuses to replace an already configured verifier. Deployment spends Sepolia test ETH. No legacy contracts are deployed.

The database command applies schema/access restrictions, seeds four synthetic records, associates `CSE2026001` with the configured Gmail sender/recipient, initializes the registry root and registers both application origins. Run this bootstrap once: changing the registered email requires fresh issuance and invalidates that student's older credentials. Local credentials, sessions and records are not migrated.

Later administration explicitly loads the cloud settings:

```powershell
node --env-file=.local/cloud.env node_modules/tsx/dist/cli.mjs scripts/student-admin.ts enroll NEW_ROLL REGISTERED_ADDRESS 2027-06-30
node --env-file=.local/cloud.env node_modules/tsx/dist/cli.mjs scripts/student-admin.ts email CSE2026001 NEW_ADDRESS
node --env-file=.local/cloud.env node_modules/tsx/dist/cli.mjs scripts/student-admin.ts revoke CSE2026001
node --env-file=.local/cloud.env node_modules/tsx/dist/cli.mjs scripts/student-admin.ts activate CSE2026001
node --env-file=.local/cloud.env node_modules/tsx/dist/cli.mjs scripts/student-admin.ts sync
```

`sync` repairs interrupted registry updates. Updates are serialized through a database transaction advisory lock and wait for a successful chain receipt before committing. If a chain update succeeds but the database commit fails, root disagreement denies access until repaired. Startup validates the RPC chain, registry bytecode, dependent verifier and registry owner.

## 4. Public assets and private course files

Restore the original matching proving assets and OCR files under `apps/demo-a/public` if necessary. The upload checks tracked SHA-256 manifests. Do not generate new proving keys to replace missing originals: that changes the verifier identity.

Put the supplied course files in the ignored `apps/demo-b/.local/library` folder with their original filenames, then run:

```powershell
node --env-file=.local/cloud.env node_modules/tsx/dist/cli.mjs scripts/upload-cloud-assets.ts
```

The script creates public `proofpass-artifacts` and private `proofpass-materials`, refusing to change an existing bucket's visibility silently. Proving/OCR assets use a manifest-derived release directory. Material uploads use cache duration zero and remain out of Git. Copy the displayed public `ARTIFACT_BASE_URL` into `.local/cloud.env`.

Builds download and verify pinned assets before copying them to expected public paths, and copy the tracked sample ID image directly. They never generate credentials or proving keys. Preserve the existing assets and verifier across website updates.

Existing library catalog IDs remain unchanged. Each file route checks its HttpOnly session, access deadline and current registry before redirecting to a signed private URL valid for **60 seconds**. Route responses use `private, no-store`; storage caching is disabled. Never add public read policies to the materials bucket. A URL already issued can remain usable during its remaining 60-second window after revocation. Downloaded copies cannot be revoked. See [Supabase private downloads](https://supabase.com/docs/guides/storage/serving/downloads).

## 5. Hosting secrets and deployment

```powershell
npm.cmd run cloud -- environment api
npm.cmd run cloud -- environment demo-a
npm.cmd run cloud -- environment demo-b
```

Import each generated `.local/vercel-APP.env` file into that project's **Settings → Environment Variables**, for **Production** only, then redeploy. Mark database credentials, private keys, Gmail password, service role key and OTP secret as sensitive. Never commit the generated files.

| Settings                               | API         | Student Lab | Campus Library |
| -------------------------------------- | ----------- | ----------- | -------------- |
| Cloud database, bounded pool           | Yes         | Yes         | Yes            |
| Registry owner key, server RPC         | Yes         | No          | No             |
| JWT keys, persistent OTP secret        | Yes         | No          | No             |
| Gmail SMTP password                    | Yes         | No          | No             |
| Public URLs, browser RPC, artifact URL | Issuer only | Yes         | Yes            |
| Private storage service key            | No          | No          | Yes            |

Deploy the API, then both sites. `/health` checks process availability; `/ready` checks enrollment database/registry agreement. Investigate readiness failures instead of bypassing them. For CLI deployment, complete `vercel login`, confirm `vercel whoami`, and link each project to its correct root. Account authorization must actually be saved by the CLI.

## 6. Acceptance walkthrough

Run `npm test`, `npm run contracts:test`, `npm run typecheck`, and the three `build:vercel:*` commands. Contract tests generate a fresh proof because saved proofs expire. Automated tests cover code verification across fresh API instances, invalid inputs, wallet/scope/replay/expiry checks, concurrency, inactive enrollment, failure rejection, hosted URLs/TLS, asset hash integrity and private download signing.

For final cloud acceptance, stop all local services and use another device:

1. Open both stable HTTPS URLs, confirm the educational notice, and select Sepolia in the wallet.
2. Receive the Gmail code for the authorized synthetic record, verify it, save the new private credential and generate a browser proof. Login uses a contract read without a user transaction fee.
3. Open all three materials. Unauthenticated library requests and public bucket URLs must fail; authorized storage links must expire after 60 seconds.
4. Sign in separately to the other app. Subjects and sessions differ; a cross-app assertion must fail.
5. Request a code, restart/redeploy the API with the same OTP secret, and complete it. Redeploy a site and verify a fresh proof with the saved credential.
6. Revoke enrollment through the cloud CLI. New logins and download-link issuance must fail. Reactivate and reissue when appropriate.
7. Reject wrong wallet/network, expired credentials and replay. Interrupt RPC/database/email in a separate test configuration and confirm no failure grants access.
8. Inspect requests/logs for accidental disclosure: no ID image, credential secret, private key or Gmail password. Roll/email/expiry go to the college issuer only; proof submission contains a challenge ID, proof and wallet signature.

Record stable URLs, Sepolia addresses/transaction hashes, measured browser proving time and optional demonstration gas in a release report. Do not mark deployment complete until the cloud walkthrough passes. Local Hardhat tests are not evidence of a Sepolia deployment.
