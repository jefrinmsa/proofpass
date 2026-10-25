import { createPublicClient, createWalletClient, getAddress, http, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { hardhat, sepolia } from 'viem/chains';
import { studentAbi, studentProofArgs, type StudentProof } from './student';
import { isCloud, requiredEnv, type Environment } from './server';

export async function createRegistryClient(env: Environment = process.env) {
  const chainId = Number(requiredEnv('CHAIN_ID', env));
  if (![31337, 11155111].includes(chainId) || (isCloud(env) && chainId !== 11155111))
    throw new Error('Only local Hardhat or public Sepolia demo networks are allowed');
  const chain = chainId === 31337 ? hardhat : sepolia;
  const rpc = requiredEnv('RPC_URL', env);
  let rpcURL: URL;
  try {
    rpcURL = new URL(rpc);
  } catch {
    throw new Error('Invalid RPC_URL');
  }
  if (chainId === 11155111 && rpcURL.protocol !== 'https:')
    throw new Error('Sepolia RPC must use HTTPS');
  const verifier = getAddress(
    requiredEnv('STUDENT_VERIFIER_ADDRESS', env),
  ).toLowerCase() as Address;
  const client = createPublicClient({
    chain,
    transport: http(rpc, { timeout: 15000, retryCount: 0 }),
  });
  if ((await client.getChainId()) !== chainId)
    throw new Error('RPC chain does not match configured chain');
  if (!(await client.getBytecode({ address: verifier })))
    throw new Error('Student verifier is not deployed');
  let account: Address | ReturnType<typeof privateKeyToAccount>;
  const wallet = createWalletClient({
    chain,
    transport: http(rpc, { timeout: 15000, retryCount: 0 }),
  });
  if (chainId === 31337) {
    if (env.STUDENT_LOCAL_ISSUER !== 'true' || isCloud(env))
      throw new Error('Unlocked accounts are restricted to explicit local development');
    [account] = await wallet.getAddresses();
  } else {
    const key = requiredEnv('REGISTRY_OWNER_PRIVATE_KEY', env);
    if (!/^0x[0-9a-fA-F]{64}$/.test(key))
      throw new Error('Invalid Sepolia registry owner key format');
    account = privateKeyToAccount(key as `0x${string}`);
  }
  if (!account) throw new Error('Registry signing account is unavailable');
  const owner = await client.readContract({
    address: verifier,
    abi: studentAbi,
    functionName: 'owner',
  });
  const signer = typeof account === 'string' ? account : account.address;
  if (owner.toLowerCase() !== signer.toLowerCase())
    throw new Error('Configured wallet is not the registry owner');
  const groth = await client.readContract({
    address: verifier,
    abi: studentAbi,
    functionName: 'verifier',
  });
  if (!(await client.getBytecode({ address: groth })))
    throw new Error('Groth16 verifier is not deployed');
  return {
    chainId,
    verifier,
    getRoot: async () =>
      String(
        await client.readContract({
          address: verifier,
          abi: studentAbi,
          functionName: 'registryRoot',
        }),
      ),
    verifyProof: (proof: StudentProof) =>
      client.readContract({
        address: verifier,
        abi: studentAbi,
        functionName: 'verify',
        args: studentProofArgs(proof),
      }),
    async setRoot(root: string) {
      const hash = await wallet.writeContract({
        account,
        chain,
        address: verifier,
        abi: studentAbi,
        functionName: 'setRegistryRoot',
        args: [BigInt(root)],
      });
      const receipt = await client.waitForTransactionReceipt({ hash, timeout: 120000 });
      if (receipt.status !== 'success') throw new Error('REGISTRY_UPDATE_FAILED');
    },
  };
}
