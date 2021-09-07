const { expect, use } = require("chai");
const { waffle, ethers, network } = require("hardhat");

const Safe = require("@gnosis.pm/safe-contracts/build/artifacts/contracts/GnosisSafe.sol/GnosisSafe.json");
const ControllerRegistry = require("../artifacts/contracts/ControllerRegistry.sol/ControllerRegistry.json");
const MemberToken = require("../artifacts/contracts/MemberToken.sol/MemberToken.json");
const Controller = require("../artifacts/contracts/Controller.sol/Controller.json");

const { provider, solidity, deployContract, deployMockContract } = waffle;

use(solidity);

const { HashZero } = ethers.constants;

describe("Member Token Test", () => {
  const [admin, proxyFactory, safeMaster, alice] = provider.getWallets();

  const POD_ID = 0;
  const CREATE_FLAG = ethers.utils.hexlify([1]);
  const TX_OPTIONS = { gasLimit: 4000000 };

  const setupMockSafe = async (members, safe) => {
    // seed safe account with eth
    await network.provider.send("hardhat_setBalance", [safe.address, "0x1D4F54CF65A0000"]);
    // create safe mock signer
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [safe.address],
    });

    await safe.mock.getThreshold.returns(1);
    await safe.mock.getOwners.returns(members);
    await safe.mock.isModuleEnabled.returns(true);
    await safe.mock.isOwner.returns(true);
    await safe.mock.addOwnerWithThreshold.returns();
    await safe.mock.removeOwner.returns();
    await safe.mock.swapOwner.returns();
    await safe.mock.execTransactionFromModule.returns(true);

    return ethers.getSigner(safe.address);
  };

  const setup = async () => {
    const controllerRegistry = await deployMockContract(admin, ControllerRegistry.abi);
    await controllerRegistry.mock.isRegistered.returns(true);

    const safe = await deployMockContract(admin, Safe.abi);

    const memberToken = await deployContract(admin, MemberToken, [controllerRegistry.address]);

    const controller = await deployContract(admin, Controller, [
      memberToken.address,
      controllerRegistry.address,
      proxyFactory.address,
      safeMaster.address,
    ]);

    const safeSigner = await setupMockSafe([admin.address], safe);

    return { memberToken, controller, controllerRegistry, proxyFactory, safeMaster, safeSigner };
  };

  describe("when minting and creation", () => {
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
      const { memberToken, controller, safeSigner } = await setup();

      await controller.connect(admin).createPodWithSafe(admin.address, safeSigner.address);
      expect(await memberToken.memberController(POD_ID)).to.equal(controller.address);
    });

    it("should mint additional memberships", async () => {
      const { memberToken, controller, safeSigner } = await setup();

      await controller.connect(admin).createPodWithSafe(admin.address, safeSigner.address);
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

  describe("when upgrading controller", () => {
    it("should transfer different memberships with the same controller", async () => {
      const { memberToken, controller, safeSigner } = await setup();

      // create 2 pods from the same controller
      await controller.connect(admin).createPodWithSafe(admin.address, safeSigner.address);
      await controller.connect(admin).createPodWithSafe(admin.address, safeSigner.address);

      await expect(
        memberToken
          .connect(admin)
          .safeBatchTransferFrom(admin.address, alice.address, [POD_ID, POD_ID + 1], [1, 1], HashZero),
      ).to.emit(memberToken, "TransferBatch");
    });

    it("should NOT let user call migrate function directly", async () => {
      const { memberToken, controllerRegistry } = await setup();

      const controllerV2 = await deployContract(admin, Controller, [
        memberToken.address,
        controllerRegistry.address,
        proxyFactory.address,
        safeMaster.address,
      ]);

      await expect(memberToken.connect(admin).migrateMemberController(POD_ID, controllerV2.address)).to.revertedWith(
        "Invalid migrate controller",
      );
    });

    it("should not migrate to an unregistered controller version", async () => {
      const { memberToken, controller, controllerRegistry, safeSigner } = await setup();

      const controllerV2 = await deployContract(admin, Controller, [
        memberToken.address,
        controllerRegistry.address,
        proxyFactory.address,
        safeMaster.address,
      ]);
      await controller.connect(admin).createPodWithSafe(admin.address, safeSigner.address);

      await controllerRegistry.mock.isRegistered.returns(false);
      await expect(controller.connect(admin).migratePodController(POD_ID, controllerV2.address)).to.revertedWith(
        "Controller not registered",
      );
    });

    it("should NOT be able to transfer memberships associate with different controllers", async () => {
      const { memberToken, controller, controllerRegistry, safeSigner } = await setup();

      const controllerV2 = await deployContract(admin, Controller, [
        memberToken.address,
        controllerRegistry.address,
        proxyFactory.address,
        safeMaster.address,
      ]);

      // create 2 pods from different controllers
      await controller.connect(admin).createPodWithSafe(admin.address, safeSigner.address);
      await controllerV2.connect(admin).createPodWithSafe(admin.address, safeSigner.address);

      await expect(
        memberToken
          .connect(admin)
          .safeBatchTransferFrom(admin.address, alice.address, [POD_ID, POD_ID + 1], [1, 1], HashZero, TX_OPTIONS),
      ).to.revertedWith("Ids have different controllers");
    });
  });
});
