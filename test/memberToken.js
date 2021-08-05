const { expect, use } = require("chai");
const { waffle, ethers } = require("hardhat");

const ControllerRegistry = require("../artifacts/contracts/ControllerRegistry.sol/ControllerRegistry.json");
const MemberToken = require("../artifacts/contracts/MemberToken.sol/MemberToken.json");
const Controller = require("../artifacts/contracts/Controller.sol/Controller.json");
const RuleManager = require("../artifacts/contracts/RuleManager.sol/RuleManager.json");
const SafeTeller = require("../artifacts/contracts/SafeTeller.sol/SafeTeller.json");

const { provider, solidity, deployContract, deployMockContract } = waffle;

use(solidity);

const { HashZero } = ethers.constants;

describe("Member Token Test", () => {
  const [admin, safe, alice] = provider.getWallets();

  const POD_ID = 0;
  const CREATE_FLAG = ethers.utils.hexlify([1]);
  const THRESHOLD = 1;
  const TX_OPTIONS = { gasLimit: 4000000 };

  const setup = async () => {
    const controllerRegistry = await deployMockContract(admin, ControllerRegistry.abi);
    await controllerRegistry.mock.isRegistered.returns(true);

    const memberToken = await deployContract(admin, MemberToken, [controllerRegistry.address]);

    const ruleManager = await deployMockContract(admin, RuleManager.abi);
    const safeTeller = await deployMockContract(admin, SafeTeller.abi);

    const controller = await deployContract(admin, Controller, [
      memberToken.address,
      ruleManager.address,
      safeTeller.address,
      controllerRegistry.address,
    ]);

    await safeTeller.mock.createSafe.returns(safe.address);
    await safeTeller.mock.onMint.returns();
    await safeTeller.mock.onTransfer.returns();
    await safeTeller.mock.migrateSafeTeller.returns();

    await ruleManager.mock.hasRules.returns(false);
    await ruleManager.mock.isRuleCompliant.returns(true);

    return { memberToken, controller, ruleManager, safeTeller, controllerRegistry };
  };

  describe("minting and creation", () => {
    it("should NOT allow pod creation without the create flag", async () => {
      const { memberToken } = await setup();
      await expect(memberToken.connect(admin).createPod([admin.address], HashZero)).to.be.revertedWith(
        "Invalid creation flag",
      );
    });

    it("should NOT allow pod creation from unregistered controller", async () => {
      await setup();
      const controllerRegistry = await deployMockContract(admin, ControllerRegistry.abi);
      await controllerRegistry.mock.isRegistered.returns(false);

      const memberToken = await deployContract(admin, MemberToken, [controllerRegistry.address]);
      await expect(memberToken.connect(admin).createPod([admin.address], CREATE_FLAG)).to.be.revertedWith(
        "Controller not registered",
      );
    });

    it("should set controller on create", async () => {
      const { memberToken, controller } = await setup();

      await controller.connect(admin).createPod([admin.address], THRESHOLD, admin.address, TX_OPTIONS);
      expect(await memberToken.memberController(POD_ID)).to.equal(controller.address);
    });

    it("should mint additional memberships", async () => {
      const { memberToken, controller } = await setup();

      await controller.connect(admin).createPod([admin.address], THRESHOLD, admin.address, TX_OPTIONS);
      await expect(memberToken.connect(admin).mint(alice.address, POD_ID, HashZero)).to.emit(
        memberToken,
        "TransferSingle",
      );
    });

    it("should NOT be able to mint memberships on a nonexistent pod", async () => {
      const { memberToken } = await setup();

      await expect(memberToken.connect(admin).mint(alice.address, POD_ID, HashZero)).to.revertedWith(
        "Cannot mint on nonexistent pod",
      );
    });
  });

  describe("upgrading controller", () => {
    it("should transfer different memberships with the same controller", async () => {
      const { memberToken, controller } = await setup();

      // create 2 pods from the same controller
      await controller.connect(admin).createPod([admin.address], THRESHOLD, admin.address, TX_OPTIONS);
      await controller.connect(admin).createPod([admin.address], THRESHOLD, admin.address, TX_OPTIONS);

      await expect(
        memberToken
          .connect(admin)
          .safeBatchTransferFrom(admin.address, alice.address, [POD_ID, POD_ID + 1], [1, 1], HashZero),
      ).to.emit(memberToken, "TransferBatch");
    });

    it("should NOT let user call migrate function directly", async () => {
      const { memberToken, ruleManager, safeTeller, controllerRegistry } = await setup();

      const controllerV2 = await deployContract(admin, Controller, [
        memberToken.address,
        ruleManager.address,
        safeTeller.address,
        controllerRegistry.address,
      ]);

      await expect(memberToken.connect(admin).migrateMemberController(POD_ID, controllerV2.address)).to.revertedWith(
        "Invalid migrate controller",
      );
    });

    it("should not migrate to an unregistered controller version", async () => {
      const { memberToken, controller, ruleManager, safeTeller, controllerRegistry } = await setup();

      const controllerV2 = await deployContract(admin, Controller, [
        memberToken.address,
        ruleManager.address,
        safeTeller.address,
        controllerRegistry.address,
      ]);
      await controller.connect(admin).createPod([admin.address], THRESHOLD, admin.address, TX_OPTIONS);

      await controllerRegistry.mock.isRegistered.returns(false);
      await expect(controller.connect(admin).migratePodController(POD_ID, controllerV2.address)).to.revertedWith(
        "Controller not registered",
      );
    });

    it("should NOT be able to transfer memberships associate with different controllers", async () => {
      const { memberToken, controller, ruleManager, safeTeller, controllerRegistry } = await setup();

      const controllerV2 = await deployContract(admin, Controller, [
        memberToken.address,
        ruleManager.address,
        safeTeller.address,
        controllerRegistry.address,
      ]);

      // create 2 pods from different controllers
      await controller.connect(admin).createPod([admin.address], THRESHOLD, admin.address, TX_OPTIONS);
      await controllerV2.connect(admin).createPod([admin.address], THRESHOLD, admin.address, TX_OPTIONS);

      await expect(
        memberToken
          .connect(admin)
          .safeBatchTransferFrom(admin.address, alice.address, [POD_ID, POD_ID + 1], [1, 1], HashZero, TX_OPTIONS),
      ).to.revertedWith("Ids have different controllers");
    });
  });
});
