const { expect, use } = require("chai");
const { waffle, ethers, network, deployments } = require("hardhat");
const { labelhash } = require("@ensdomains/ensjs");

const Safe = require("@gnosis.pm/safe-contracts/build/artifacts/contracts/GnosisSafe.sol/GnosisSafe.json");
const Controller = require("../artifacts/contracts/Controller.sol/Controller.json");

const { provider, solidity, deployContract, deployMockContract } = waffle;

use(solidity);

const AddressOne = "0x0000000000000000000000000000000000000001";
const { HashZero } = ethers.constants;

describe("Member Token Test", () => {
  const [admin, proxyFactory, safeMaster, alice] = provider.getWallets();

  const POD_ID = 0;
  const CREATE_FLAG = ethers.utils.hexlify([1]);
  const POD_LABEL = labelhash("test");
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
    await deployments.fixture(["Base"]);

    const controller = await ethers.getContract("Controller", admin);
    const memberToken = await ethers.getContract("MemberToken", admin);
    const controllerRegistry = await ethers.getContract("ControllerRegistry", admin);
    const podENSRegistrar = await ethers.getContract("PodENSRegistrar", admin);

    const safe = await deployMockContract(admin, Safe.abi);
    const safeSigner = await setupMockSafe([admin.address], safe);

    return { memberToken, controller, controllerRegistry, proxyFactory, safeMaster, safeSigner, podENSRegistrar };
  };

  describe("when minting and creation", () => {
    it("should NOT allow pod creation from unregistered controller", async () => {
      const { memberToken } = await setup();

      await expect(memberToken.connect(admin).createPod([admin.address], CREATE_FLAG)).to.be.revertedWith(
        "Controller not registered",
      );
    });

    it("should set controller on create", async () => {
      const { memberToken, controller, safeSigner } = await setup();

      await controller.connect(admin).createPodWithSafe(admin.address, safeSigner.address, POD_LABEL);
      expect(await memberToken.memberController(POD_ID)).to.equal(controller.address);
    });

    it("should mint additional memberships", async () => {
      const { memberToken, controller, safeSigner } = await setup();

      await controller.connect(admin).createPodWithSafe(admin.address, safeSigner.address, POD_LABEL);
      await expect(memberToken.connect(admin).mint(alice.address, POD_ID, HashZero)).to.emit(
        memberToken,
        "TransferSingle",
      );
    });

    it("should NOT be able to mint memberships on a nonexistent pod", async () => {
      const { memberToken } = await setup();

      await expect(memberToken.connect(admin).mint(alice.address, POD_ID, HashZero)).to.revertedWith(
        "Pod doesn't exist",
      );
    });
  });

  describe("when upgrading controller", () => {
    it("should transfer different memberships with the same controller", async () => {
      const { memberToken, controller, safeSigner } = await setup();

      // create 2 pods from the same controller
      await controller.connect(admin).createPodWithSafe(admin.address, safeSigner.address, POD_LABEL);
      await controller.connect(admin).createPodWithSafe(admin.address, safeSigner.address, labelhash("test2"));

      await expect(
        memberToken
          .connect(admin)
          .safeBatchTransferFrom(admin.address, alice.address, [POD_ID, POD_ID + 1], [1, 1], HashZero),
      ).to.emit(memberToken, "TransferBatch");
    });

    it("should NOT let user call migrate function directly", async () => {
      const { memberToken, controllerRegistry, podENSRegistrar } = await setup();

      const controllerV2 = await deployContract(admin, Controller, [
        memberToken.address,
        controllerRegistry.address,
        proxyFactory.address,
        safeMaster.address,
        podENSRegistrar.address,
      ]);

      await expect(memberToken.connect(admin).migrateMemberController(POD_ID, controllerV2.address)).to.revertedWith(
        "Invalid migrate controller",
      );
    });

    it("should NOT migrate to an unregistered controller version", async () => {
      const { memberToken, controller, controllerRegistry, safeSigner, podENSRegistrar } = await setup();

      const controllerV2 = await deployContract(admin, Controller, [
        memberToken.address,
        controllerRegistry.address,
        proxyFactory.address,
        safeMaster.address,
        podENSRegistrar.address,
      ]);
      await controller.connect(admin).createPodWithSafe(admin.address, safeSigner.address, POD_LABEL);

      await expect(
        controller.connect(admin).migratePodController(POD_ID, controllerV2.address, AddressOne),
      ).to.revertedWith("Controller not registered");
    });

    it("should NOT be able to transfer memberships associate with different controllers", async () => {
      const { memberToken, controller, controllerRegistry, safeSigner, podENSRegistrar } = await setup();

      const controllerV2 = await deployContract(admin, Controller, [
        memberToken.address,
        controllerRegistry.address,
        proxyFactory.address,
        safeMaster.address,
        podENSRegistrar.address,
      ]);

      await controllerRegistry.connect(admin).registerController(controllerV2.address);

      // create 2 pods from the same controller
      await controller.connect(admin).createPodWithSafe(admin.address, safeSigner.address, POD_LABEL);
      await controllerV2.connect(admin).createPodWithSafe(admin.address, safeSigner.address, labelhash("test2"));

      await expect(
        memberToken
          .connect(admin)
          .safeBatchTransferFrom(admin.address, alice.address, [POD_ID, POD_ID + 1], [1, 1], HashZero, TX_OPTIONS),
      ).to.revertedWith("Ids have different controllers");
    });
  });
});
