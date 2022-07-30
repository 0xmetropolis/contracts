const { expect } = require("chai");
const { ethers, deployments } = require("hardhat");
const { labelhash } = require("@ensdomains/ensjs");

const GnosisSafe = require("@gnosis.pm/safe-contracts/build/artifacts/contracts/GnosisSafe.sol/GnosisSafe.json");

const { AddressZero, HashZero } = ethers.constants;

/// ///// THESE TEST ARE MEANT TO TEST BACKWARDS COMPATIBILITY OF MIGRATIONS //////////

describe("pod migration test", () => {
  const TX_OPTIONS = { gasLimit: 4000000 };
  const GUARD_STORAGE_SLOT = "0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8";

  // current controller being tested - will attempt to test migrations to this version
  const CONTROLLER_LATEST = "ControllerV1.3";

  // create pod args
  let MEMBERS = [];
  const LEGACY_POD_ID = 0;
  const UPGRADE_POD_ID = 1;
  const IMAGE_URL = "img";
  let [admin, owner, alice, bob, charlie] = [];

  before(async () => {
    [admin, owner, alice, bob, charlie] = await ethers.getSigners();
    MEMBERS = [alice.address, bob.address];
  });

  const createSafe = async (controller, podId) =>
    new ethers.Contract(await controller.podIdToSafe(podId), GnosisSafe.abi, owner);

  const getDependencies = async () => {
    const memberToken = await ethers.getContractAt(
      "MemberToken",
      (
        await deployments.get("MemberToken")
      ).address,
      admin,
    );
    const controllerRegistry = await ethers.getContractAt(
      "ControllerRegistry",
      (
        await deployments.get("ControllerRegistry")
      ).address,
      admin,
    );
    const podEnsRegistrar = await ethers.getContractAt(
      "PodEnsRegistrar",
      (
        await deployments.get("PodEnsRegistrar")
      ).address,
      admin,
    );
    await podEnsRegistrar.setRestrictionState(2); // 2 == open enrollment

    return { memberToken, controllerRegistry, podEnsRegistrar };
  };

  const getController = async (name, _admin) => {
    const { address: controllerAddress, abi: controllerAbi } = await deployments.get(name);
    return ethers.getContractAt(controllerAbi, controllerAddress, _admin);
  };

  const setupV0 = async () => {
    await deployments.fixture(["Base", "Registry", "Controller", "ControllerV1", CONTROLLER_LATEST]);
    const controller = {};
    controller.VPrev = await getController("Controller", admin);
    controller.VNext = await getController(CONTROLLER_LATEST, admin);

    const { memberToken, controllerRegistry } = await getDependencies(controller);
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

  const setupV1 = async controllerV1 => {
    await deployments.fixture(["Base", "Registry", "Controller", controllerV1, CONTROLLER_LATEST]);
    const controller = {};
    controller.VPrev = await getController(controllerV1, admin);
    controller.VNext = await getController(CONTROLLER_LATEST, admin);

    const { memberToken, controllerRegistry } = await getDependencies(controller);
    // register VNext contracts
    await controllerRegistry.connect(admin).registerController(controller.VNext.address);

    // create VPrev pods
    await controller.VPrev.createPod(
      MEMBERS,
      1,
      owner.address,
      labelhash("test"),
      "test.pod.eth",
      LEGACY_POD_ID,
      IMAGE_URL,
      TX_OPTIONS,
    );
    await controller.VPrev.createPod(
      MEMBERS,
      1,
      owner.address,
      labelhash("test2"),
      "test2.pod.eth",
      UPGRADE_POD_ID,
      IMAGE_URL,
      TX_OPTIONS,
    );

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
      expect(await upgradePod.isModuleEnabled(controller.VPrev.address)).to.equal(false);
      expect(await upgradePod.isModuleEnabled(controller.VNext.address)).to.equal(true);
      // check to see if guard has been enabled
      // strip off the address 0x for comparison
      expect(await upgradePod.getStorageAt(GUARD_STORAGE_SLOT, 1)).to.include(
        controller.VNext.address.substring(2).toLowerCase(),
      );
      expect(await controller.VNext.areModulesLocked(upgradePod.address)).to.equal(true);

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

  // Test Execution
  describe(`should test Controller to ${CONTROLLER_LATEST}`, async () => migrationTests(setupV0));

  describe(`should test ControllerV1 to ${CONTROLLER_LATEST}`, async () =>
    migrationTests(() => setupV1("ControllerV1")));

  describe(`should test ControllerV1.1 to ${CONTROLLER_LATEST}`, async () =>
    migrationTests(() => setupV1("ControllerV1.1")));

  describe(`should test ControllerV1.2 to ${CONTROLLER_LATEST}`, async () =>
    migrationTests(() => setupV1("ControllerV1.2")));
});
