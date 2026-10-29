# Sepolia deployment — 29 October 2026

Student proof contracts were deployed to Ethereum Sepolia (chain 11155111) using the existing student proving key and generated verifier. No proving keys were regenerated.

| Contract                                        | Address                                                                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| StudentAuth registry and authentication wrapper | [`0x1f58e4aaf6C8C50062Cbc7Ed6F612B46639e676E`](https://sepolia.etherscan.io/address/0x1f58e4aaf6C8C50062Cbc7Ed6F612B46639e676E) |
| StudentGroth16Verifier                          | [`0x51Aa69a52C347420082b8D76801B6432fB1E88b2`](https://sepolia.etherscan.io/address/0x51Aa69a52C347420082b8D76801B6432fB1E88b2) |

Deployment transactions:

- [Groth16 verifier deployment](https://sepolia.etherscan.io/tx/0xd397987dea6764c410d2257040d795c49cb456cfa0daef9e22aaa41be43c9433): 3,196,672 gas.
- [Registry deployment](https://sepolia.etherscan.io/tx/0x25f6980c877b31ce6389706580f41b60d01e1301fcb9e5e5694b96c00c17de75): 2,808,071 gas.

Checks completed through Sepolia RPC:

- Actual chain ID, deployed bytecode and registry owner/dependent-verifier configuration matched.
- Groth16 runtime bytecode matched the existing compiled verifier exactly.
- The existing real synthetic proof was accepted by the Groth16 contract; a modified proof was rejected.
- The registry was initialized to the depth-eight empty enrollment tree. No student credential has been authorized in this cloud registry yet.
- Matching proving artifacts passed their tracked SHA-256 checks.

The proof check called the underlying Groth16 verifier directly. It does not establish a successful enrollment/login through the wrapper: that also requires current registry membership, challenge binding, expiry checks, database, email delivery and application configuration. Explorer source-code publication has not been performed; runtime bytecode was checked directly.

The private cloud configuration now contains the Sepolia RPC, chain ID and wrapper address. The private wallet key remains in ignored local configuration. Supabase database/storage and public Vercel application deployment still require their account configuration; the complete public login flow is not live. Follow [cloud deployment](cloud-deployment.md) for those remaining steps.
