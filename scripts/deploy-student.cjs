const hre = require('hardhat');
const fs = require('node:fs/promises');
async function main() {
  const chainId = Number((await hre.ethers.provider.getNetwork()).chainId);
  if (
    ![31337, 11155111].includes(chainId) ||
    (hre.network.name === 'sepolia' && chainId !== 11155111)
  )
    throw new Error('Student demo deployment requires the expected test network');
  const groth = await (await hre.ethers.getContractFactory('StudentGroth16Verifier')).deploy();
  await groth.waitForDeployment();
  const auth = await (
    await hre.ethers.getContractFactory('StudentAuth')
  ).deploy(await groth.getAddress());
  await auth.waitForDeployment();
  const data = {
    chainId: Number((await hre.ethers.provider.getNetwork()).chainId),
    verifier: await auth.getAddress(),
    groth16: await groth.getAddress(),
    owner: await auth.owner(),
    verifierTransaction: groth.deploymentTransaction().hash,
    registryTransaction: auth.deploymentTransaction().hash,
  };
  await fs.mkdir('deployments', { recursive: true });
  await fs.writeFile(`deployments/student-${hre.network.name}.json`, JSON.stringify(data, null, 2));
  console.log(data);
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
