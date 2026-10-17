const hre = require('hardhat');
const fs = require('node:fs/promises');
async function main() {
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
  };
  await fs.mkdir('deployments', { recursive: true });
  await fs.writeFile(`deployments/student-${hre.network.name}.json`, JSON.stringify(data, null, 2));
  console.log(data);
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
