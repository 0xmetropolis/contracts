const { expect, use } = require("chai");
const { waffle, ethers, deployments } = require("hardhat");

const GnosisSafe = require("@gnosis.pm/safe-contracts/build/artifacts/contracts/GnosisSafe.sol/GnosisSafe.json");
const Controller = require("../artifacts/contracts/Controller.sol/Controller.json");

const { deployContract, solidity, provider } = waffle;

const { AddressZero, HashZero } = ethers.constants;

use(solidity);

describe("pod migration test", () => {
  const [admin, owner, alice, bob, charlie] = provider.getWallets();

  const TX_OPTIONS = { gasLimit: 4000000 };

  // create pod args
  const MEMBERS = [alice.address, bob.address];
  const LEGACY_POD_ID = 0;
  const UPGRADE_POD_ID = 1;

  let controllerRegistry;
  let memberToken;

  const controller = {};

  const createPodSafe = async (podId, members, ownerAddress = AddressZero) => {
    const threshold = 1;
    await controller.V1.createPod(members, threshold, ownerAddress, TX_OPTIONS);
    const safeAddress = await controller.V1.safeAddress(podId);
    return new ethers.Contract(safeAddress, GnosisSafe.abi, owner);
  };

  const setup = async () => {
    await deployments.fixture(["Base"]);

    const gnosisSafeProxyFactory = await ethers.getContract("GnosisSafeProxyFactory", admin);
    const gnosisSafeMaster = await ethers.getContract("GnosisSafe", admin);

    controller.V1 = await ethers.getContract("Controller", admin);

    memberToken = await ethers.getContract("MemberToken", admin);
    controllerRegistry = await ethers.getContract("ControllerRegistry", admin);

    // V2
    // deploy V2 contract
    controller.V2 = await deployContract(admin, Controller, [
      memberToken.address,
      controllerRegistry.address,
      gnosisSafeProxyFactory.address,
      gnosisSafeMaster.address,
    ]);

    // register V2 contracts
    await controllerRegistry.connect(admin).registerController(controller.V2.address);

    // create V1 pods
    const legacyPod = await createPodSafe(LEGACY_POD_ID, MEMBERS, owner.address);
    const upgradePod = await createPodSafe(UPGRADE_POD_ID, MEMBERS, owner.address);

    // migrate pod to V2
    await controller.V1.connect(owner).migratePodController(UPGRADE_POD_ID, controller.V2.address);

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
    expect(await controller.V1.safeAddress(UPGRADE_POD_ID)).to.equal(AddressZero);
    expect(await controller.V1.podAdmin(UPGRADE_POD_ID)).to.equal(AddressZero);
    // should update state in new controller
    expect(await controller.V2.safeAddress(UPGRADE_POD_ID)).to.equal(upgradePod.address);
    expect(await controller.V2.podAdmin(UPGRADE_POD_ID)).to.equal(owner.address);
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
  });

  it("should be able to mint memberships for legacy pod", async () => {
    await setup();

    await expect(memberToken.connect(owner).mint(charlie.address, LEGACY_POD_ID, HashZero, TX_OPTIONS))
      .to.emit(memberToken, "TransferSingle")
      .withArgs(owner.address, AddressZero, charlie.address, LEGACY_POD_ID, 1);
  });
});
