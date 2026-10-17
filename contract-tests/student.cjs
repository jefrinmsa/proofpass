const assert = require('node:assert/strict');
const fs = require('node:fs');
const { ethers } = require('hardhat');
describe('Student membership contract', function () {
  let auth, owner, other, p, s;
  before(async function () {
    [owner, other] = await ethers.getSigners();
    const fixture = JSON.parse(fs.readFileSync('.local/student-proof.json'));
    p = fixture.groth16;
    s = fixture.publicSignals;
    const verifier = await (await ethers.getContractFactory('StudentGroth16Verifier')).deploy();
    auth = await (
      await ethers.getContractFactory('StudentAuth')
    ).deploy(await verifier.getAddress());
    await auth.setRegistryRoot(s[2]);
  });
  it('verifies a real student proof', async () => assert.equal(await auth.verify(p, s), true));
  it('rejects tampered proof and public inputs', async () => {
    for (const index of [0, 1, 2, 3, 4, 5, 6]) {
      const changed = [...s];
      changed[index] = (BigInt(changed[index]) + 1n).toString();
      assert.equal(await auth.verify(p, changed), false);
    }
    const changed = [...p];
    changed[0] = '0';
    assert.equal(await auth.verify(changed, s), false);
  });
  it('only the college can update the registry', async () => {
    await assert.rejects(auth.connect(other).setRegistryRoot('123'));
  });
  it('requires demonstration sender to match the proved wallet', async () => {
    await assert.rejects(auth.connect(other).demonstrate(p, s));
    const receipt = await (await auth.demonstrate(p, s)).wait();
    assert.equal(receipt.status, 1);
    fs.writeFileSync(
      '.local/student-gas.json',
      JSON.stringify({ gasUsed: receipt.gasUsed.toString() }),
    );
  });
  it('revocation root invalidates old proofs', async () => {
    await auth.setRegistryRoot('123');
    assert.equal(await auth.verify(p, s), false);
  });
});
