const { expect, use } = require("chai");
const { waffle, ethers } = require("hardhat");

const OrcaProtocol = require("../artifacts/contracts/OrcaProtocol.sol/OrcaProtocol.json");
const MemberToken = require("../artifacts/contracts/MemberToken.sol/MemberToken.json");
const RuleManager = require("../artifacts/contracts/RuleManager.sol/RuleManager.json");
const SafeTeller = require("../artifacts/contracts/SafeTeller.sol/SafeTeller.json");
const OwnerToken = require("../artifacts/contracts/OwnerToken.sol/OwnerToken.json");

const { deployContract, deployMockContract, solidity, provider } = waffle;

const { AddressZero, HashZero } = ethers.constants;

use(solidity);

describe("OrcaProtocol beforeTokenTransfer Test", () => {
  const [admin, owner, safe, alice, bob, charlie] = provider.getWallets();

  const TX_OPTIONS = { gasLimit: 4000000 };

  // create pod args
  const POD_ID = 1;
  const MEMBERS = [alice.address, bob.address];

  let orcaProtocol;
  let ownerToken;
  let safeTeller;
  let ruleManager;
  let memberToken;

  const createPod = async (members, ownerAddress = AddressZero) => {
    await ruleManager.mock.hasRules.returns(false);
    // user is compliant if there are no rules
    await ruleManager.mock.isRuleCompliant.returns(true);

    await safeTeller.mock.createSafe.returns(safe.address);
    const threshold = 1;
    await orcaProtocol.createPod(POD_ID, members, threshold, ownerAddress, TX_OPTIONS);
  };

  const setup = async () => {
    ruleManager = await deployMockContract(admin, RuleManager.abi);
    safeTeller = await deployMockContract(admin, SafeTeller.abi);

    memberToken = await deployContract(admin, MemberToken);
    ownerToken = await deployContract(admin, OwnerToken);

    orcaProtocol = await deployContract(admin, OrcaProtocol, [
      memberToken.address,
      ruleManager.address,
      safeTeller.address,
      ownerToken.address,
    ]);

    await memberToken.connect(admin).updateController(orcaProtocol.address, TX_OPTIONS);
    await safeTeller.mock.onMint.returns();
    await safeTeller.mock.onTransfer.returns();
    await safeTeller.mock.onBurn.returns();
    await createPod(MEMBERS, owner.address);
  };

  describe("minting membership tokens without rules", () => {
    beforeEach(async () => {
      await setup();
    });

    it("should allow owner to mint membership token with no rules", async () => {
      await expect(memberToken.connect(owner).mint(charlie.address, POD_ID, HashZero, TX_OPTIONS))
        .to.emit(memberToken, "TransferSingle")
        .withArgs(owner.address, AddressZero, charlie.address, POD_ID, 1);
    });

    it("should allow pod to mint membership token with no rules", async () => {
      await expect(memberToken.connect(safe).mint(charlie.address, POD_ID, HashZero, TX_OPTIONS))
        .to.emit(memberToken, "TransferSingle")
        .withArgs(safe.address, AddressZero, charlie.address, POD_ID, 1);
    });

    it("should NOT allow a user to mint membership token with no rules", async () => {
      await expect(memberToken.connect(charlie).mint(charlie.address, POD_ID, HashZero, TX_OPTIONS)).to.be.revertedWith(
        "No Rules Set",
      );
    });
  });

  describe("burning membership tokens without rules", () => {
    beforeEach(async () => {
      await setup();
    });

    it("should allow owner to burn membership token with no rules", async () => {
      await expect(memberToken.connect(owner).burn(bob.address, POD_ID, TX_OPTIONS))
        .to.emit(memberToken, "TransferSingle")
        .withArgs(owner.address, bob.address, AddressZero, POD_ID, 1);
    });

    it("should allow pod to burn membership token with no rules", async () => {
      await expect(memberToken.connect(safe).burn(bob.address, POD_ID, TX_OPTIONS))
        .to.emit(memberToken, "TransferSingle")
        .withArgs(safe.address, bob.address, AddressZero, POD_ID, 1);
    });

    it("should NOT allow a user to burn membership token with no rules", async () => {
      await expect(memberToken.connect(charlie).burn(bob.address, POD_ID, TX_OPTIONS)).to.be.revertedWith(
        "No Rules Set",
      );
    });
  });

  describe("transferring membership tokens without rules", () => {
    beforeEach(async () => {
      await setup();
    });

    it("should allow user to transfer membership token with no rules", async () => {
      await expect(
        memberToken.connect(bob).safeTransferFrom(bob.address, charlie.address, POD_ID, 1, HashZero, TX_OPTIONS),
      )
        .to.emit(memberToken, "TransferSingle")
        .withArgs(bob.address, bob.address, charlie.address, POD_ID, 1);
    });
  });

  describe("managing membership tokens of rule compliant user", () => {
    beforeEach(async () => {
      await setup();
      await ruleManager.mock.hasRules.returns(true);
      await ruleManager.mock.isRuleCompliant.returns(true);
    });

    it("should allow rule compliant user to mint membership token", async () => {
      await expect(memberToken.connect(charlie).mint(charlie.address, POD_ID, HashZero, TX_OPTIONS))
        .to.emit(memberToken, "TransferSingle")
        .withArgs(charlie.address, AddressZero, charlie.address, POD_ID, 1);
    });

    it("should allow rule compliant user to be transferred membership token", async () => {
      await expect(
        memberToken.connect(bob).safeTransferFrom(bob.address, charlie.address, POD_ID, 1, HashZero, TX_OPTIONS),
      )
        .to.emit(memberToken, "TransferSingle")
        .withArgs(bob.address, bob.address, charlie.address, POD_ID, 1);
    });

    it("should NOT allow a user to burn membership token with no rules", async () => {
      await expect(memberToken.connect(charlie).burn(bob.address, POD_ID, TX_OPTIONS)).to.be.revertedWith(
        "Rule Compliant",
      );
    });
  });

  describe("managing membership tokens of rule non-compliant user", () => {
    beforeEach(async () => {
      await setup();
      await ruleManager.mock.hasRules.returns(true);
      await ruleManager.mock.isRuleCompliant.returns(false);
    });

    it("should NOT allow rule non-compliant user to mint membership token", async () => {
      await expect(memberToken.connect(charlie).mint(charlie.address, POD_ID, HashZero, TX_OPTIONS)).to.be.revertedWith(
        "Not Rule Compliant",
      );
    });

    it("should NOT allow rule non-compliant user to be transferred a membership token", async () => {
      await expect(
        memberToken.connect(bob).safeTransferFrom(bob.address, charlie.address, POD_ID, 1, HashZero, TX_OPTIONS),
      ).to.be.revertedWith("Not Rule Compliant");
    });

    it("should allow a user to burn membership token of a rule non-compliant user", async () => {
      await expect(memberToken.connect(charlie).burn(bob.address, POD_ID, TX_OPTIONS))
        .to.emit(memberToken, "TransferSingle")
        .withArgs(charlie.address, bob.address, AddressZero, POD_ID, 1);
    });
  });
});
