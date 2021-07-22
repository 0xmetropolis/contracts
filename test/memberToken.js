const { expect, use } = require("chai");
const { waffle, ethers } = require("hardhat");

const MemberToken = require("../artifacts/contracts/MemberToken.sol/MemberToken.json");
const Controller = require("../artifacts/contracts/Controller.sol/Controller.json");
const RuleManager = require("../artifacts/contracts/RuleManager.sol/RuleManager.json");
const SafeTeller = require("../artifacts/contracts/SafeTeller.sol/SafeTeller.json");

const { provider, solidity, deployContract, deployMockContract } = waffle;

use(solidity);

const { HashZero } = ethers.constants;

describe("Member Token Test", () => {
  const [admin, safe, alice] = provider.getWallets();

  const POD_ID = 1;
  const CREATE_FLAG = ethers.utils.hexlify([1]);
  const THRESHOLD = 1;
  const TX_OPTIONS = { gasLimit: 4000000 };

  const setup = async () => {
    const memberToken = await deployContract(admin, MemberToken);

    const ruleManager = await deployMockContract(admin, RuleManager.abi);
    const safeTeller = await deployMockContract(admin, SafeTeller.abi);

    const controller = await deployContract(admin, Controller, [
      memberToken.address,
      ruleManager.address,
      safeTeller.address,
    ]);

    await safeTeller.mock.createSafe.returns(safe.address);
    await safeTeller.mock.onMint.returns();
    await safeTeller.mock.onTransfer.returns();

    await ruleManager.mock.hasRules.returns(false);
    await ruleManager.mock.isRuleCompliant.returns(true);

    await memberToken.connect(admin).registerController(controller.address, TX_OPTIONS);

    return { memberToken, controller, ruleManager, safeTeller };
  };

  it("should deploy and register Member Token with controller", async () => {
    const memberToken = await deployContract(admin, MemberToken);
    const controller = await deployMockContract(admin, Controller.abi);

    await memberToken.connect(admin).registerController(controller.address, TX_OPTIONS);

    expect(await memberToken.owner()).to.equal(admin.address);
    expect(await memberToken.controllerRegistry(controller.address)).to.equal(true);
  });

  describe("minting and creation", () => {
    it("should NOT allow token creation without the create flag", async () => {
      const { memberToken } = await setup();
      await expect(memberToken.connect(admin).mint(admin.address, POD_ID, HashZero)).to.be.revertedWith(
        "Invalid creation flag",
      );
      await expect(memberToken.connect(admin).mintSingleBatch([admin.address], POD_ID, HashZero)).to.be.revertedWith(
        "Invalid creation flag",
      );
    });

    it("should NOT allow token creation from unregistered controller", async () => {
      const { memberToken } = await setup();

      await expect(memberToken.connect(admin).mint(admin.address, POD_ID, CREATE_FLAG)).to.be.revertedWith(
        "Controller not registered",
      );
      await expect(memberToken.connect(admin).mintSingleBatch([admin.address], POD_ID, CREATE_FLAG)).to.be.revertedWith(
        "Controller not registered",
      );
    });

    it("should set controller on create", async () => {
      const { memberToken, controller } = await setup();

      await controller.connect(admin).createPod(POD_ID, [admin.address], THRESHOLD, admin.address, TX_OPTIONS);
      expect(await memberToken.memberController(POD_ID)).to.equal(controller.address);
    });

    it("should mint additional memberships", async () => {
      const { memberToken, controller } = await setup();

      await controller.connect(admin).createPod(POD_ID, [admin.address], THRESHOLD, admin.address, TX_OPTIONS);
      await expect(memberToken.connect(admin).mint(alice.address, POD_ID, HashZero)).to.emit(
        memberToken,
        "TransferSingle",
      );
    });
  });

  describe("upgrading controller", () => {
    it("should remove a controller", async () => {
      const { memberToken, controller } = await setup();

      await memberToken.connect(admin).removeController(controller.address, TX_OPTIONS);

      expect(await memberToken.controllerRegistry(controller.address, TX_OPTIONS)).to.equal(false);
    });

    it("should transfer different memberships with the same controller", async () => {
      const { memberToken, controller } = await setup();

      // create 2 pods from the same controller
      await controller.connect(admin).createPod(POD_ID, [admin.address], THRESHOLD, admin.address, TX_OPTIONS);
      await controller.connect(admin).createPod(POD_ID + 1, [admin.address], THRESHOLD, admin.address, TX_OPTIONS);

      await expect(
        memberToken
          .connect(admin)
          .safeBatchTransferFrom(admin.address, alice.address, [POD_ID, POD_ID + 1], [1, 1], HashZero),
      ).to.emit(memberToken, "TransferBatch");
    });

    it("should NOT be able to create the same pod from multiple controllers", async () => {
      const { memberToken, controller, ruleManager, safeTeller } = await setup();

      const controllerV2 = await deployContract(admin, Controller, [
        memberToken.address,
        ruleManager.address,
        safeTeller.address,
      ]);

      await memberToken.connect(admin).registerController(controllerV2.address, TX_OPTIONS);

      // create 2 pods from different controllers
      await controller.connect(admin).createPod(POD_ID, [admin.address], THRESHOLD, admin.address, TX_OPTIONS);
      await expect(
        controllerV2.connect(admin).createPod(POD_ID, [admin.address], THRESHOLD, admin.address, TX_OPTIONS),
      ).to.revertedWith("pod already exists");
    });

    it("should NOT be able to transfer memberships associate with different controllers", async () => {
      const { memberToken, controller, ruleManager, safeTeller } = await setup();

      const controllerV2 = await deployContract(admin, Controller, [
        memberToken.address,
        ruleManager.address,
        safeTeller.address,
      ]);

      await memberToken.connect(admin).registerController(controllerV2.address, TX_OPTIONS);

      // create 2 pods from different controllers
      await controller.connect(admin).createPod(POD_ID, [admin.address], THRESHOLD, admin.address, TX_OPTIONS);
      await controllerV2.connect(admin).createPod(POD_ID + 1, [admin.address], THRESHOLD, admin.address, TX_OPTIONS);

      await expect(
        memberToken
          .connect(admin)
          .safeBatchTransferFrom(admin.address, alice.address, [POD_ID, POD_ID + 1], [1, 1], HashZero, TX_OPTIONS),
      ).to.revertedWith("Ids have different controllers");
    });
  });
});
