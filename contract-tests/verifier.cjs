const assert = require('node:assert/strict');
const fs = require('node:fs');
const { ethers } = require('hardhat');
const { testPublicKeyHash } = require('@anon-aadhaar/core');
describe('Test-key verifier and age policy', function () {
  let wrapper;
  before(async () => {
    const groth = await (await ethers.getContractFactory('Verifier')).deploy();
    const aadhaar = await (
      await ethers.getContractFactory('AnonAadhaar')
    ).deploy(await groth.getAddress(), testPublicKeyHash);
    wrapper = await (
      await ethers.getContractFactory('TestAadhaarAuth')
    ).deploy(await aadhaar.getAddress(), testPublicKeyHash);
  });
  it('exposes the published test key', async () =>
    assert.equal((await wrapper.testPublicKeyHash()).toString(), testPublicKeyHash));
  it('rejects an underage flag', async () =>
    assert.equal(await wrapper.verify(1, 2, 1, 42, [0, 0, 0, 0], Array(8).fill(0)), false));
  it('rejects unwanted disclosure', async () =>
    assert.equal(await wrapper.verify(1, 2, 1, 42, [1, 70, 0, 0], Array(8).fill(0)), false));
  it('rejects a fake proof', async () =>
    assert.equal(await wrapper.verify(1, 2, 1, 42, [1, 0, 0, 0], Array(8).fill(0)), false));
  it('rejects a mismatched constructor key', async () => {
    const groth = await (await ethers.getContractFactory('Verifier')).deploy();
    const a = await (
      await ethers.getContractFactory('AnonAadhaar')
    ).deploy(await groth.getAddress(), 1);
    await assert.rejects(
      (await ethers.getContractFactory('TestAadhaarAuth')).deploy(await a.getAddress(), 2),
    );
  });
  (fs.existsSync('.local/adult-proof.json') ? it : it.skip)(
    'rejects an actual proof against the wrong signing key',
    async () => {
      const p = JSON.parse(fs.readFileSync('.local/adult-proof.json'));
      const groth = await (await ethers.getContractFactory('Verifier')).deploy();
      const a = await (
        await ethers.getContractFactory('AnonAadhaar')
      ).deploy(await groth.getAddress(), BigInt(testPublicKeyHash) + 1n);
      const wrong = await (
        await ethers.getContractFactory('TestAadhaarAuth')
      ).deploy(await a.getAddress(), BigInt(testPublicKeyHash) + 1n);
      assert.equal(
        await wrong.verify(
          p.nullifierSeed,
          p.nullifier,
          p.timestamp,
          p.signal,
          p.reveal,
          p.groth16,
        ),
        false,
      );
    },
  );
  for (const name of ['adult', 'underage', 'eighteenth-birthday', 'nineteenth-birthday']) {
    (fs.existsSync(`.local/${name}-proof.json`) ? it : it.skip)(
      `verifies actual ${name} fixture and rejects tampering`,
      async () => {
        const p = JSON.parse(fs.readFileSync(`.local/${name}-proof.json`));
        const args = [p.nullifierSeed, p.nullifier, p.timestamp, p.signal, p.reveal, p.groth16];
        assert.equal(await wrapper.verify(...args), p.reveal[0] === '1');
        if (p.reveal[0] === '1') {
          assert.equal(
            await wrapper.verify(
              p.nullifierSeed,
              p.nullifier,
              p.timestamp,
              '43',
              p.reveal,
              p.groth16,
            ),
            false,
          );
          const tx = await wrapper.demonstrate(...args);
          const receipt = await tx.wait();
          console.log(`Measured demonstration gas (${name}): ${receipt.gasUsed}`);
        }
      },
    );
  }
});
