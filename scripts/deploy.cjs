const hre = require('hardhat');
const fs = require('node:fs/promises');
async function main() {
  const { testPublicKeyHash } = require('@anon-aadhaar/core');
  const groth = await (await hre.ethers.getContractFactory('Verifier')).deploy();
  await groth.waitForDeployment();
  const aadhaar = await (
    await hre.ethers.getContractFactory('AnonAadhaar')
  ).deploy(await groth.getAddress(), testPublicKeyHash);
  await aadhaar.waitForDeployment();
  const wrapper = await (
    await hre.ethers.getContractFactory('TestAadhaarAuth')
  ).deploy(await aadhaar.getAddress(), testPublicKeyHash);
  await wrapper.waitForDeployment();
  const receipt = await wrapper.deploymentTransaction().wait();
  const deployment = {
    chainId: Number((await hre.ethers.provider.getNetwork()).chainId),
    verifier: await wrapper.getAddress(),
    aadhaar: await aadhaar.getAddress(),
    groth16: await groth.getAddress(),
    testPublicKeyHash,
    wrapperDeploymentGas: receipt.gasUsed.toString(),
  };
  await fs.mkdir('deployments', { recursive: true });
  await fs.writeFile(`deployments/${hre.network.name}.json`, JSON.stringify(deployment, null, 2));
  console.log(deployment);
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
