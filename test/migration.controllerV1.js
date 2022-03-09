const { expect, use } = require("chai");
const { waffle, ethers, deployments } = require("hardhat");
const { labelhash } = require("@ensdomains/ensjs");

const GnosisSafe = require("@gnosis.pm/safe-contracts/build/artifacts/contracts/GnosisSafe.sol/GnosisSafe.json");

const { solidity, provider } = waffle;

const { AddressZero, HashZero } = ethers.constants;

use(solidity);

// Test Backwards compatibility
describe("pod migration test", () => {
  const [admin, owner, alice, bob, charlie] = provider.getWallets();

  const TX_OPTIONS = { gasLimit: 4000000 };

  // create pod args
  const MEMBERS = [alice.address, bob.address];
  const LEGACY_POD_ID = 0;
  const UPGRADE_POD_ID = 1;

  const createSafe = async (controller, podId) =>
    new ethers.Contract(await controller.podIdToSafe(podId), GnosisSafe.abi, owner);

  const setDependancies = async () => {
    const memberToken = await ethers.getContract("MemberToken", admin);
    const controllerRegistry = await ethers.getContract("ControllerRegistry", admin);
    const podEnsRegistrar = await ethers.getContract("PodEnsRegistrar", admin);
    await podEnsRegistrar.setRestrictionState(2); // 2 == open enrollment

    return { memberToken, controllerRegistry, podEnsRegistrar };
  };

  const setupV0 = async () => {
    await deployments.fixture(["Base", "Registry", "Controller", "ControllerV1"]);
    const controller = {};
    controller.VPrev = await ethers.getContract("Controller", admin);
    controller.VNext = await ethers.getContract("ControllerV1", admin);

    const { memberToken, controllerRegistry } = await setDependancies(controller);
    // register VNext contracts
    await controllerRegistry.connect(admin).registerController(controller.VNext.address);

    // create VPrev pods
    await controller.VPrev.createPod(MEMBERS, 1, owner.address, labelhash("test"), "test.pod.eth", TX_OPTIONS);
    await controller.VPrev.createPod(MEMBERS, 1, owner.address, labelhash("test2"), "test2.pod.eth", TX_OPTIONS);

    return {
      upgradePod: await createSafe(controller.VPrev, UPGRADE_POD_ID),
      legacyPod: await createSafe(controller.VPrev, LEGACY_POD_ID),
      controllerRegistry,
      memberToken,
      controller,
    };
  };

  const migrationTests = setup => {
    it("should update pod controller in memberToken", async () => {
      const { memberToken, controller } = await setup();

      // migrate pod to VNext
      await controller.VPrev.connect(owner).migratePodController(
        UPGRADE_POD_ID,
        controller.VNext.address,
        controller.VNext.address,
      );
      // should point the member token to new controller
      expect(await memberToken.memberController(UPGRADE_POD_ID)).to.equal(controller.VNext.address);
    });

    it("should migrate pod state to new controller", async () => {
      const { upgradePod, controller } = await setup();
      // migrate pod to VNext
      await controller.VPrev.connect(owner).migratePodController(
        UPGRADE_POD_ID,
        controller.VNext.address,
        controller.VNext.address,
      );

      // should clear pod state on old controller
      expect(await controller.VPrev.podIdToSafe(UPGRADE_POD_ID)).to.equal(AddressZero);
      expect(await controller.VPrev.podAdmin(UPGRADE_POD_ID)).to.equal(AddressZero);
      expect(await controller.VPrev.safeToPodId(upgradePod.address)).to.equal(0);
      // should update state in new controller
      expect(await controller.VNext.podIdToSafe(UPGRADE_POD_ID)).to.equal(upgradePod.address);
      expect(await controller.VNext.podAdmin(UPGRADE_POD_ID)).to.equal(owner.address);
      expect(await controller.VNext.safeToPodId(upgradePod.address)).to.equal(UPGRADE_POD_ID);
    });

    it("should migrate safe to new controller version", async () => {
      const { upgradePod, legacyPod, controller } = await setup();
      // migrate pod to VNext
      await controller.VPrev.connect(owner).migratePodController(
        UPGRADE_POD_ID,
        controller.VNext.address,
        controller.VNext.address,
      );

      // check upgraded pod
      expect(await upgradePod.isModuleEnabled(controller.VNext.address)).to.equal(true);
      expect(await upgradePod.isModuleEnabled(controller.VPrev.address)).to.equal(false);
      // check legacy pod
      expect(await legacyPod.isModuleEnabled(controller.VPrev.address)).to.equal(true);
      expect(await legacyPod.isModuleEnabled(controller.VNext.address)).to.equal(false);
    });

    it("should be able to mint memberships for upgraded pod", async () => {
      const { memberToken, controller } = await setup();
      // migrate pod to VNext
      await controller.VPrev.connect(owner).migratePodController(
        UPGRADE_POD_ID,
        controller.VNext.address,
        controller.VNext.address,
      );

      await expect(memberToken.connect(owner).mint(charlie.address, UPGRADE_POD_ID, HashZero, TX_OPTIONS))
        .to.emit(memberToken, "TransferSingle")
        .withArgs(owner.address, AddressZero, charlie.address, UPGRADE_POD_ID, 1);

      const safeAddress = controller.VNext.podIdToSafe(UPGRADE_POD_ID);
      const safe = new ethers.Contract(safeAddress, GnosisSafe.abi, owner);
      const owners = await safe.getOwners();
      expect(owners).to.include(charlie.address);
    });

    it("should be able to mint memberships for legacy pod", async () => {
      const { memberToken, controller } = await setup();
      // migrate pod to VNext
      await controller.VPrev.connect(owner).migratePodController(
        UPGRADE_POD_ID,
        controller.VNext.address,
        controller.VNext.address,
      );

      await expect(memberToken.connect(owner).mint(charlie.address, LEGACY_POD_ID, HashZero, TX_OPTIONS))
        .to.emit(memberToken, "TransferSingle")
        .withArgs(owner.address, AddressZero, charlie.address, LEGACY_POD_ID, 1);

      const safeAddress = controller.VPrev.podIdToSafe(LEGACY_POD_ID);
      const safe = new ethers.Contract(safeAddress, GnosisSafe.abi, owner);
      const owners = await safe.getOwners();
      expect(owners).to.include(charlie.address);
    });
  };

  describe("should test Controller to ControllerV1", async () => migrationTests(setupV0));
});
