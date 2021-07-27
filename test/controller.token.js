const { expect, use } = require("chai");
const { waffle, ethers } = require("hardhat");

const ControllerRegistry = require("../artifacts/contracts/ControllerRegistry.sol/ControllerRegistry.json");
const Controller = require("../artifacts/contracts/Controller.sol/Controller.json");
const MemberToken = require("../artifacts/contracts/MemberToken.sol/MemberToken.json");
const RuleManager = require("../artifacts/contracts/RuleManager.sol/RuleManager.json");
const SafeTeller = require("../artifacts/contracts/SafeTeller.sol/SafeTeller.json");

const { deployContract, deployMockContract, solidity, provider } = waffle;

const { AddressZero, HashZero } = ethers.constants;

use(solidity);

describe("Controller beforeTokenTransfer Test", () => {
  const [admin, safe, alice, bob, charlie] = provider.getWallets();

  const TX_OPTIONS = { gasLimit: 4000000 };

  // create pod args
  const POD_ID = 1;
  const MEMBERS = [alice.address, bob.address];

  let controller;
  let safeTeller;
  let ruleManager;
  let memberToken;

  const createPod = async (members, adminAddress = AddressZero) => {
    await ruleManager.mock.hasRules.returns(false);
    // user is compliant if there are no rules
    await ruleManager.mock.isRuleCompliant.returns(true);

    await safeTeller.mock.createSafe.returns(safe.address);
    const threshold = 1;
    await controller.createPod(POD_ID, members, threshold, adminAddress, TX_OPTIONS);
  };

  const setup = async () => {
    const controllerRegistry = await deployMockContract(admin, ControllerRegistry.abi);
    await controllerRegistry.mock.isRegistered.returns(true);

    ruleManager = await deployMockContract(admin, RuleManager.abi);
    safeTeller = await deployMockContract(admin, SafeTeller.abi);

    memberToken = await deployContract(admin, MemberToken, [controllerRegistry.address]);

    controller = await deployContract(admin, Controller, [
      memberToken.address,
      ruleManager.address,
      safeTeller.address,
      controllerRegistry.address,
    ]);

    await safeTeller.mock.onMint.returns();
    await safeTeller.mock.onTransfer.returns();
    await safeTeller.mock.onBurn.returns();
    await createPod(MEMBERS, admin.address);
  };

  it("should not let a user call beforeTokenTransfer function", async () => {
    await setup();
    await expect(
      controller.beforeTokenTransfer(admin.address, admin.address, alice.address, [POD_ID], [1], HashZero),
    ).to.be.revertedWith("Not Authorized");
  });

  describe("minting membership tokens without rules", () => {
    beforeEach(async () => {
      await setup();
    });

    it("should allow admin to mint membership token with no rules", async () => {
      await expect(memberToken.connect(admin).mint(charlie.address, POD_ID, HashZero, TX_OPTIONS))
        .to.emit(memberToken, "TransferSingle")
        .withArgs(admin.address, AddressZero, charlie.address, POD_ID, 1);
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

    it("should allow admin to burn membership token with no rules", async () => {
      await expect(memberToken.connect(admin).burn(bob.address, POD_ID, TX_OPTIONS))
        .to.emit(memberToken, "TransferSingle")
        .withArgs(admin.address, bob.address, AddressZero, POD_ID, 1);
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
