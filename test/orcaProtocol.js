const { expect, use } = require("chai");
const { waffle, ethers } = require("hardhat");

const EthersSafe = require("@gnosis.pm/safe-core-sdk").default;

const GnosisSafe = require("@gnosis.pm/safe-contracts/build/artifacts/contracts/GnosisSafe.sol/GnosisSafe.json");
const GnosisSafeProxyFactory = require("@gnosis.pm/safe-contracts/build/artifacts/contracts/proxies/GnosisSafeProxyFactory.sol/GnosisSafeProxyFactory.json");
const MultiSend = require("@gnosis.pm/safe-contracts/build/artifacts/contracts/libraries/MultiSend.sol/MultiSend.json");

const OrcaProtocol = require("../artifacts/contracts/OrcaProtocol.sol/OrcaProtocol.json");
const MemberToken = require("../artifacts/contracts/MemberToken.sol/MemberToken.json");
const RuleManager = require("../artifacts/contracts/RuleManager.sol/RuleManager.json");
const SafeTeller = require("../artifacts/contracts/SafeTeller.sol/SafeTeller.json");
const OwnerToken = require("../artifacts/contracts/OwnerToken.sol/OwnerToken.json");

const { deployContract, deployMockContract, provider, solidity } = waffle;

use(solidity);

let multiSend;
let orcaProtocol;

const createSafeSigner = async (safe, signer) => {
  const { chainId } = await provider.getNetwork();
  return EthersSafe.create({
    ethers,
    safeAddress: safe.address,
    providerOrSigner: signer,
    contractNetworks: {
      [chainId]: {
        multiSendAddress: multiSend.address,
      },
    },
  });
};

const setup = async () => {
  const [admin] = provider.getWallets();
  // Deploy the master safe contract and multisend
  multiSend = await deployContract(admin, MultiSend);
  const gnosisSafeMaster = await deployContract(admin, GnosisSafe);
  const gnosisSafeProxyFactory = await deployContract(admin, GnosisSafeProxyFactory);

  const memberToken = await deployContract(admin, MemberToken);
  const safeTeller = await deployContract(admin, SafeTeller);
  const ownerToken = await deployContract(admin, OwnerToken);

  const ruleManager = await deployMockContract(admin, RuleManager.abi);

  orcaProtocol = await deployContract(admin, OrcaProtocol, [
    memberToken.address,
    ruleManager.address,
    safeTeller.address,
    ownerToken.address,
  ]);

  await memberToken.connect(admin).updateController(orcaProtocol.address);
  await safeTeller.connect(admin).updateController(orcaProtocol.address);

  await safeTeller.connect(admin).updateSafeAddresses(gnosisSafeProxyFactory.address, gnosisSafeMaster.address);
  return { memberToken, safeTeller, ownerToken, ruleManager, orcaProtocol };
};

const execSafeTransaction = async (safe, signers, txArgs) => {
  const safeSigners = await Promise.all(signers.map(signer => createSafeSigner(safe, signer)));

  const safeTransaction = await safeSigners[0].createTransaction(txArgs);
  await safeSigners[0].signTransaction(safeTransaction);
  const txRes = await safeSigners[1].executeTransaction(safeTransaction);
  await txRes.wait();
};

describe("OrcaProtocol", () => {
  const [admin, owner, alice, bob, charlie] = provider.getWallets();

  const THRESHOLD = 2;
  const MEMBERS = [alice.address, bob.address];
  const POD_ID = 1;

  const createSafe = async () => {
    await orcaProtocol.connect(owner).createPod(POD_ID, MEMBERS, THRESHOLD, owner.address);
    // query the new gnosis safe
    const safeAddress = await orcaProtocol.safeAddress(POD_ID);
    const podSafe = new ethers.Contract(safeAddress, GnosisSafe.abi, owner);
    return { podSafe };
  };

  describe("new pod creation with safe deployment", () => {
    it("should create a new safe with safe teller module", async () => {
      const { safeTeller } = await setup();
      const { podSafe } = await createSafe();

      const ethersSafe = await createSafeSigner(podSafe, admin);
      // threshold and owners
      expect(await ethersSafe.getThreshold()).to.equal(THRESHOLD);
      expect(await ethersSafe.getOwners()).to.deep.equal(MEMBERS);
      // check to see if module has been enabled
      expect(await ethersSafe.isModuleEnabled(safeTeller.address)).to.equal(true);
    });

    it("should distribute member and owner tokens", async () => {
      const { ownerToken, memberToken } = await setup();
      await createSafe();

      // should mint owner token
      expect(await ownerToken.balanceOf(owner.address)).to.equal(1);
      // should mint member tokens
      expect(await memberToken.balanceOf(alice.address, POD_ID)).to.equal(1);
      expect(await memberToken.balanceOf(bob.address, POD_ID)).to.equal(1);
    });
  });

  describe("membership management with no rules", () => {
    it("should be able to transfer memberships without rules", async () => {
      const { ruleManager, memberToken } = await setup();
      const { podSafe } = await createSafe();
      // set mocks
      await ruleManager.mock.hasRules.returns(false);
      await ruleManager.mock.isRuleCompliant.returns(true);

      const ethersSafe = await createSafeSigner(podSafe, admin);

      await memberToken.connect(alice).safeTransferFrom(alice.address, charlie.address, POD_ID, 1, "0x");
      expect(await memberToken.balanceOf(alice.address, POD_ID)).to.equal(0);
      expect(await memberToken.balanceOf(charlie.address, POD_ID)).to.equal(1);

      expect(await ethersSafe.getOwners()).to.deep.equal([charlie.address, bob.address]);
    });

    it("should NOT be able to slash members without rules", async () => {
      const { ruleManager } = await setup();
      await createSafe();
      // set mocks
      await ruleManager.mock.hasRules.returns(false);
      await ruleManager.mock.isRuleCompliant.returns(true);

      await expect(orcaProtocol.retractMembership(POD_ID, alice.address)).to.be.revertedWith("No Rules Set");
    });

    it("should NOT be able to claim new membership without rules", async () => {
      const { ruleManager } = await setup();
      await createSafe();
      // set mocks
      await ruleManager.mock.isRuleCompliant.returns(true);
      await ruleManager.mock.hasRules.returns(false);

      await expect(orcaProtocol.connect(charlie).claimMembership(POD_ID, charlie.address)).to.be.revertedWith(
        "No Rules Set",
      );
    });

    it("should let the pod mint new memberships without rules", async () => {
      const { ruleManager, memberToken } = await setup();
      const { podSafe } = await createSafe();
      // set mocks
      await ruleManager.mock.hasRules.returns(false);
      await ruleManager.mock.isRuleCompliant.returns(true);

      const ethersSafe = await createSafeSigner(podSafe, admin);

      await execSafeTransaction(podSafe, [alice, bob], {
        to: orcaProtocol.address,
        data: orcaProtocol.interface.encodeFunctionData("claimMembership", [POD_ID, charlie.address]),
        value: 0,
      });

      expect(await memberToken.balanceOf(charlie.address, POD_ID)).to.equal(1);

      expect(await ethersSafe.getOwners()).to.deep.equal([charlie.address, ...MEMBERS]);
    });

    it("should let the pod burn memberships without rules", async () => {
      const { ruleManager, memberToken } = await setup();
      const { podSafe } = await createSafe();
      // set mocks
      await ruleManager.mock.hasRules.returns(false);
      await ruleManager.mock.isRuleCompliant.returns(true);

      const ethersSafe = await createSafeSigner(podSafe, admin);

      await execSafeTransaction(podSafe, [alice, bob], {
        to: orcaProtocol.address,
        data: orcaProtocol.interface.encodeFunctionData("retractMembership", [POD_ID, bob.address]),
        value: 0,
      });

      expect(await memberToken.balanceOf(bob.address, POD_ID)).to.equal(0);

      expect(await ethersSafe.getOwners()).to.deep.equal([alice.address]);
    });
  });

  describe("membership management with rules", () => {
    it("should be able to transfer memberships to someone rule compliant", async () => {
      const { ruleManager, memberToken } = await setup();
      const { podSafe } = await createSafe();
      // set mocks
      await ruleManager.mock.hasRules.returns(true);
      await ruleManager.mock.isRuleCompliant.withArgs(POD_ID, charlie.address).returns(true);

      const ethersSafe = await createSafeSigner(podSafe, admin);

      await memberToken.connect(alice).safeTransferFrom(alice.address, charlie.address, POD_ID, 1, "0x");
      expect(await memberToken.balanceOf(alice.address, POD_ID)).to.equal(0);
      expect(await memberToken.balanceOf(charlie.address, POD_ID)).to.equal(1);

      expect(await ethersSafe.getOwners()).to.deep.equal([charlie.address, bob.address]);
    });

    it("should NOT be able to transfer memberships to someone non-compliant", async () => {
      const { ruleManager, memberToken } = await setup();
      await createSafe();
      // set mocks
      await ruleManager.mock.hasRules.returns(true);
      await ruleManager.mock.isRuleCompliant.withArgs(POD_ID, charlie.address).returns(false);

      await expect(
        memberToken.connect(alice).safeTransferFrom(alice.address, charlie.address, POD_ID, 1, "0x"),
      ).to.be.revertedWith("Rule Compliant");
    });

    it("should be able to slash non-compliant members", async () => {
      const { ruleManager, memberToken } = await setup();
      const { podSafe } = await createSafe();
      // set mocks
      await ruleManager.mock.hasRules.returns(true);
      await ruleManager.mock.isRuleCompliant.withArgs(POD_ID, alice.address).returns(false);

      const ethersSafe = await createSafeSigner(podSafe, admin);

      await orcaProtocol.retractMembership(POD_ID, alice.address);

      expect(await memberToken.balanceOf(alice.address, POD_ID)).to.equal(0);
      expect(await ethersSafe.getOwners()).to.deep.equal([bob.address]);
    });

    it("should NOT be able to slash compliant members", async () => {
      const { ruleManager } = await setup();
      await createSafe();
      // set mocks
      await ruleManager.mock.hasRules.returns(true);
      await ruleManager.mock.isRuleCompliant.withArgs(POD_ID, alice.address).returns(true);

      await expect(orcaProtocol.retractMembership(POD_ID, alice.address)).to.be.revertedWith("Rule Compliant");
    });

    it("should be able to claim membership if compliant", async () => {
      const { ruleManager, memberToken } = await setup();
      const { podSafe } = await createSafe();
      // set mocks
      await ruleManager.mock.hasRules.returns(true);
      await ruleManager.mock.isRuleCompliant.withArgs(POD_ID, charlie.address).returns(true);

      const ethersSafe = await createSafeSigner(podSafe, admin);

      await orcaProtocol.claimMembership(POD_ID, charlie.address);

      expect(await memberToken.balanceOf(charlie.address, POD_ID)).to.equal(1);
      expect(await ethersSafe.getOwners()).to.deep.equal([charlie.address, ...MEMBERS]);
    });

    it("should NOT be able to claim new membership if non-compliant", async () => {
      const { ruleManager } = await setup();
      await createSafe();
      // set mocks
      await ruleManager.mock.hasRules.returns(true);
      await ruleManager.mock.isRuleCompliant.withArgs(POD_ID, charlie.address).returns(false);

      await expect(orcaProtocol.connect(charlie).claimMembership(POD_ID, charlie.address)).to.be.revertedWith(
        "Not Rule Compliant",
      );
    });
  });
});
