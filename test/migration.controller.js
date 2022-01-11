const { expect, use } = require("chai");
const { waffle, ethers, deployments } = require("hardhat");
const { labelhash } = require("@ensdomains/ensjs");

const GnosisSafe = require("@gnosis.pm/safe-contracts/build/artifacts/contracts/GnosisSafe.sol/GnosisSafe.json");

const { solidity, provider } = waffle;

const { AddressZero, HashZero } = ethers.constants;

use(solidity);

describe("pod migration test", () => {
  const [admin, owner, alice, bob, charlie] = provider.getWallets();

  const TX_OPTIONS = { gasLimit: 4000000 };

  // create pod args
  const MEMBERS = [alice.address, bob.address];
  const LEGACY_POD_ID = 0;
  const UPGRADE_POD_ID = 1;
  const IMAGE_URL = "https://testnet.com/";

  let controllerRegistry;
  let memberToken;

  const controller = {};

  const createPodSafe = async (podId, members, ownerAddress = AddressZero, label) => {
    const threshold = 1;

    await controller.V1.createPod(members, threshold, ownerAddress, label, IMAGE_URL, podId, TX_OPTIONS);
    const safeAddress = await controller.V1.podIdToSafe(podId);
    return new ethers.Contract(safeAddress, GnosisSafe.abi, owner);
  };

  const setup = async () => {
    await deployments.fixture(["Base", "Registry", "Controller", "ControllerV1"]);

    controller.V1 = await ethers.getContract("Controller", admin);
    controller.V2 = await ethers.getContract("ControllerV1", admin);

    memberToken = await ethers.getContract("MemberToken", admin);
    controllerRegistry = await ethers.getContract("ControllerRegistry", admin);
    const podEnsRegistrar = await ethers.getContract("PodEnsRegistrar", admin);
    await podEnsRegistrar.setRestrictionState(2); // 2 == open enrollment

    // register V2 contracts
    await controllerRegistry.connect(admin).registerController(controller.V2.address);

    // create V1 pods
    const legacyPod = await createPodSafe(LEGACY_POD_ID, MEMBERS, owner.address, labelhash("test"), "test.pod.eth");
    const upgradePod = await createPodSafe(UPGRADE_POD_ID, MEMBERS, owner.address, labelhash("test2"), "test2.pod.eth");

    // migrate pod to V2
    await controller.V1.connect(owner).migratePodController(
      UPGRADE_POD_ID,
      controller.V2.address,
      controller.V2.address,
    );

    return { upgradePod, legacyPod };
  };

  it("should update pod controller in memberToken", async () => {
    await setup();
    // should point the member token to new controller
    expect(await memberToken.memberController(UPGRADE_POD_ID)).to.equal(controller.V2.address);
  });

  it("should migrate pod state to new controller", async () => {
    const { upgradePod } = await setup();

    // should clear pod state on old controller
    expect(await controller.V1.podIdToSafe(UPGRADE_POD_ID)).to.equal(AddressZero);
    expect(await controller.V1.podAdmin(UPGRADE_POD_ID)).to.equal(AddressZero);
    expect(await controller.V1.safeToPodId(upgradePod.address)).to.equal(0);
    // should update state in new controller
    expect(await controller.V2.podIdToSafe(UPGRADE_POD_ID)).to.equal(upgradePod.address);
    expect(await controller.V2.podAdmin(UPGRADE_POD_ID)).to.equal(owner.address);
    expect(await controller.V2.safeToPodId(upgradePod.address)).to.equal(UPGRADE_POD_ID);
  });

  it("should migrate safe to new controller version", async () => {
    const { upgradePod, legacyPod } = await setup();

    // check upgraded pod
    expect(await upgradePod.isModuleEnabled(controller.V2.address)).to.equal(true);
    expect(await upgradePod.isModuleEnabled(controller.V1.address)).to.equal(false);
    // check legacy pod
    expect(await legacyPod.isModuleEnabled(controller.V1.address)).to.equal(true);
    expect(await legacyPod.isModuleEnabled(controller.V2.address)).to.equal(false);
  });

  it("should be able to mint memberships for upgraded pod", async () => {
    await setup();

    await expect(memberToken.connect(owner).mint(charlie.address, UPGRADE_POD_ID, HashZero, TX_OPTIONS))
      .to.emit(memberToken, "TransferSingle")
      .withArgs(owner.address, AddressZero, charlie.address, UPGRADE_POD_ID, 1);

    const safeAddress = controller.V2.podIdToSafe(UPGRADE_POD_ID);
    const safe = new ethers.Contract(safeAddress, GnosisSafe.abi, owner);
    const owners = await safe.getOwners();
    expect(owners).to.include(charlie.address);
  });

  it("should be able to mint memberships for legacy pod", async () => {
    await setup();

    await expect(memberToken.connect(owner).mint(charlie.address, LEGACY_POD_ID, HashZero, TX_OPTIONS))
      .to.emit(memberToken, "TransferSingle")
      .withArgs(owner.address, AddressZero, charlie.address, LEGACY_POD_ID, 1);

    const safeAddress = controller.V1.podIdToSafe(LEGACY_POD_ID);
    const safe = new ethers.Contract(safeAddress, GnosisSafe.abi, owner);
    const owners = await safe.getOwners();
    expect(owners).to.include(charlie.address);
  });
});
