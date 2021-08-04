const { expect, use } = require("chai");
const { waffle, ethers } = require("hardhat");

const EthersSafe = require("@gnosis.pm/safe-core-sdk").default;

const GnosisSafe = require("@gnosis.pm/safe-contracts/build/artifacts/contracts/GnosisSafe.sol/GnosisSafe.json");
const GnosisSafeProxyFactory = require("@gnosis.pm/safe-contracts/build/artifacts/contracts/proxies/GnosisSafeProxyFactory.sol/GnosisSafeProxyFactory.json");
const MultiSend = require("@gnosis.pm/safe-contracts/build/artifacts/contracts/libraries/MultiSend.sol/MultiSend.json");

const ControllerRegistry = require("../artifacts/contracts/ControllerRegistry.sol/ControllerRegistry.json");
const Controller = require("../artifacts/contracts/Controller.sol/Controller.json");
const MemberToken = require("../artifacts/contracts/MemberToken.sol/MemberToken.json");
const RuleManager = require("../artifacts/contracts/RuleManager.sol/RuleManager.json");
const SafeTeller = require("../artifacts/contracts/SafeTeller.sol/SafeTeller.json");

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

  let multiSend;
  const controllerRegistry = {};
  const controller = {};
  const safeTeller = {};
  const ruleManager = {};
  const memberToken = {};

  const createSafeSigner = async (safe, signer) => {
    const { chainId } = await provider.getNetwork();
    return EthersSafe.create({
      ethers,
      safeAddress: safe.address,
      providerOrSigner: signer,
      contractNetworks: {
        [chainId]: {
          multiSendAddress: multiSend.address,
        },
      },
    });
  };

  const createPodSafe = async (podId, members, ownerAddress = AddressZero) => {
    const threshold = 1;
    await controller.V1.createPod(members, threshold, ownerAddress, TX_OPTIONS);
    const safeAddress = await controller.V1.safeAddress(podId);
    return new ethers.Contract(safeAddress, GnosisSafe.abi, owner);
  };

  const setup = async () => {
    multiSend = await deployContract(admin, MultiSend);
    const gnosisSafeMaster = await deployContract(admin, GnosisSafe);
    const gnosisSafeProxyFactory = await deployContract(admin, GnosisSafeProxyFactory);

    // V1
    // deploy V1 contracts
    controllerRegistry.V1 = await deployContract(admin, ControllerRegistry);
    ruleManager.V1 = await deployContract(admin, RuleManager);
    safeTeller.V1 = await deployContract(admin, SafeTeller, [gnosisSafeProxyFactory.address, gnosisSafeMaster.address]);
    memberToken.V1 = await deployContract(admin, MemberToken, [controllerRegistry.V1.address]);

    controller.V1 = await deployContract(admin, Controller, [
      memberToken.V1.address,
      ruleManager.V1.address,
      safeTeller.V1.address,
      controllerRegistry.V1.address,
    ]);
    // register V1 controller
    await controllerRegistry.V1.connect(admin).registerController(controller.V1.address);
    await safeTeller.V1.connect(admin).updateController(controller.V1.address, TX_OPTIONS);

    // V2
    // deploy V2 contracts
    ruleManager.V2 = await deployContract(admin, RuleManager);
    safeTeller.V2 = await deployContract(admin, SafeTeller, [gnosisSafeProxyFactory.address, gnosisSafeMaster.address]);

    controller.V2 = await deployContract(admin, Controller, [
      memberToken.V1.address,
      ruleManager.V2.address,
      safeTeller.V2.address,
      controllerRegistry.V1.address,
    ]);

    // register V2 contracts
    await controllerRegistry.V1.connect(admin).registerController(controller.V2.address);
    await safeTeller.V2.connect(admin).updateController(controller.V2.address, TX_OPTIONS);

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
    expect(await memberToken.V1.memberController(UPGRADE_POD_ID)).to.equal(controller.V2.address);
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

  it("should migrate safe to new safe teller version", async () => {
    const { upgradePod, legacyPod } = await setup();

    // check upgraded pod
    expect(await upgradePod.isModuleEnabled(safeTeller.V2.address)).to.equal(true);
    expect(await upgradePod.isModuleEnabled(safeTeller.V1.address)).to.equal(false);
    // check legacy pod
    expect(await legacyPod.isModuleEnabled(safeTeller.V1.address)).to.equal(true);
    expect(await legacyPod.isModuleEnabled(safeTeller.V2.address)).to.equal(false);
  });

  it("should be able to mint memberships for upgraded pod", async () => {
    await setup();

    await expect(memberToken.V1.connect(owner).mint(charlie.address, UPGRADE_POD_ID, HashZero, TX_OPTIONS))
      .to.emit(memberToken.V1, "TransferSingle")
      .withArgs(owner.address, AddressZero, charlie.address, UPGRADE_POD_ID, 1);
  });

  it("should be able to mint memberships for legacy pod", async () => {
    await setup();

    await expect(memberToken.V1.connect(owner).mint(charlie.address, LEGACY_POD_ID, HashZero, TX_OPTIONS))
      .to.emit(memberToken.V1, "TransferSingle")
      .withArgs(owner.address, AddressZero, charlie.address, LEGACY_POD_ID, 1);
  });
});
