const { expect } = require("chai");
const { ethers, deployments } = require("hardhat");

const { labelhash } = require("@ensdomains/ensjs");

const GnosisSafe = require("@gnosis.pm/safe-contracts/build/artifacts/contracts/GnosisSafe.sol/GnosisSafe.json");

const { createSafeSigner, createSafeWithControllerModule } = require("./utils");

describe("create pod integration test", () => {
  let controller;

  const { AddressZero } = ethers.constants;

  const TX_OPTIONS = { gasLimit: 4000000 };
  const GUARD_STORAGE_SLOT = "0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8";

  const THRESHOLD = 1;
  const POD_ID = 0;
  const IMAGE_URL = "https://orcaprotocol-nft.vercel.app/assets/testnet/00000001";

  // current controller being tested
  const CONTROLLER_LATEST = "ControllerV1.4";

  const setup = async () => {
    const { chainId } = await ethers.provider.getNetwork();

    await deployments.fixture(["Base", "Registrar", CONTROLLER_LATEST]);

    const signers = await ethers.getSigners();
    const [admin, alice, bob] = signers;

    // hardhat ethers doesn't recognize controller versions
    const { address: controllerAddress, abi: controllerAbi } = await deployments.get(CONTROLLER_LATEST);
    controller = await ethers.getContractAt(controllerAbi, controllerAddress, admin);

    const podEnsRegistrar = await ethers.getContractAt(
      "PodEnsRegistrar",
      (
        await deployments.get("PodEnsRegistrar")
      ).address,
      admin,
    );

    await podEnsRegistrar.setRestrictionState(2); // 2 == open enrollment

    const memberToken = await ethers.getContractAt(
      "MemberToken",
      (
        await deployments.get("MemberToken")
      ).address,
      admin,
    );

    const createPodHelper = async _admin => {
      controller.createPod(
        [alice.address, bob.address],
        THRESHOLD,
        _admin ? admin.address : AddressZero,
        labelhash("test"),
        "test.pod.eth",
        POD_ID,
        IMAGE_URL,
        TX_OPTIONS,
      );
      // query the new gnosis safe
      const safeAddress = await controller.podIdToSafe(POD_ID);
      const ethersSafe = await createSafeSigner(safeAddress, alice);
      const safeContract = new ethers.Contract(safeAddress, GnosisSafe.abi, alice);

      return { safeContract, ethersSafe };
    };

    const createPodWithSafeHelper = async _admin => {
      const ethersSafe = await createSafeWithControllerModule([alice.address, bob.address], controller.address, alice);

      await controller
        .connect(alice)
        .createPodWithSafe(
          _admin ? admin.address : AddressZero,
          ethersSafe.getAddress(),
          labelhash("test2"),
          "test2.pod.eth",
          POD_ID,
          IMAGE_URL,
        );
      const safeContract = new ethers.Contract(ethersSafe.getAddress(), GnosisSafe.abi, alice);
      return { safeContract, ethersSafe };
    };

    // const ens = new ENS({ ethers.provider, ensAddress: registryAddress });

    return {
      chainId,
      memberToken,
      podEnsRegistrar,
      signers,
      createPodHelper,
      createPodWithSafeHelper,
      // ens,
    };
  };

  describe("when creating through createPod", () => {
    let { signers, memberToken, safeContract, ethersSafe, createPodHelper } = {};
    let [, alice, bob] = [];

    before(async () => {
      ({ signers, safeContract, ethersSafe, memberToken, createPodHelper } = await setup());

      [, alice, bob] = signers;
      // create pod no admin
      ({ ethersSafe, safeContract } = await createPodHelper());
    });

    it("should set safe state correctly", async () => {
      // threshold and owners
      expect(await ethersSafe.getThreshold()).to.equal(THRESHOLD);
      expect(await ethersSafe.getOwners()).to.deep.equal([alice.address, bob.address]);
      // check to see if module has been enabled
      expect(await ethersSafe.isModuleEnabled(controller.address)).to.equal(true);
      // check to see if guard has been enabled
      // strip off the address 0x for comparison
      expect(await safeContract.getStorageAt(GUARD_STORAGE_SLOT, 1)).to.include(
        controller.address.substring(2).toLowerCase(),
      );
    });
    it("set member token state correctly", async () => {
      expect(await memberToken.memberController(POD_ID)).to.equal(controller.address);
      // should mint member tokens
      expect(await memberToken.balanceOf(alice.address, POD_ID)).to.equal(1);
      expect(await memberToken.balanceOf(bob.address, POD_ID)).to.equal(1);
    });

    it("should set controller state correctly", async () => {
      expect(await controller.podIdToSafe(POD_ID)).to.equal(safeContract.address);
      expect(await controller.safeToPodId(safeContract.address)).to.equal(POD_ID);
      // check admin
      expect(await controller.podAdmin(POD_ID)).to.equal(AddressZero);
      // check safe teller
      expect(await controller.areModulesLocked(safeContract.address)).to.equal(false);
    });
  });

  describe("when creating through createPod with Admin", () => {
    let { signers, memberToken, safeContract, ethersSafe, createPodHelper } = {};
    let [admin, alice, bob] = [];

    before(async () => {
      ({ signers, safeContract, ethersSafe, memberToken, createPodHelper } = await setup());

      [admin, alice, bob] = signers;
      // create pod with admin
      ({ ethersSafe, safeContract } = await createPodHelper(admin));
    });

    it("should set safe state correctly", async () => {
      // threshold and owners
      expect(await ethersSafe.getThreshold()).to.equal(THRESHOLD);
      expect(await ethersSafe.getOwners()).to.deep.equal([alice.address, bob.address]);
      // check to see if module has been enabled
      expect(await ethersSafe.isModuleEnabled(controller.address)).to.equal(true);
      // check to see if guard has been enabled
      // strip off the address 0x for comparison
      expect(await safeContract.getStorageAt(GUARD_STORAGE_SLOT, 1)).to.include(
        controller.address.substring(2).toLowerCase(),
      );
    });
    it("set member token state correctly", async () => {
      expect(await memberToken.memberController(POD_ID)).to.equal(controller.address);
      // should mint member tokens
      expect(await memberToken.balanceOf(alice.address, POD_ID)).to.equal(1);
      expect(await memberToken.balanceOf(bob.address, POD_ID)).to.equal(1);
    });

    it("should set controller state correctly", async () => {
      expect(await controller.podIdToSafe(POD_ID)).to.equal(safeContract.address);
      expect(await controller.safeToPodId(safeContract.address)).to.equal(POD_ID);
      // check admin
      expect(await controller.podAdmin(POD_ID)).to.equal(admin.address);
      // check safe teller
      expect(await controller.areModulesLocked(safeContract.address)).to.equal(true);
    });
  });

  // CREATE POD WITH SAFE TESTS

  describe("when creating new pod through createPodWithSafe without an admin", () => {
    let { signers, memberToken, ethersSafe, safeContract, createPodWithSafeHelper } = {};
    let [, alice, bob] = [];

    before(async () => {
      ({ signers, ethersSafe, memberToken, createPodWithSafeHelper } = await setup());

      [, alice, bob] = signers;
      // create pod with safe no admin
      ({ ethersSafe, safeContract } = await createPodWithSafeHelper());
    });

    it("should set safe state correctly", async () => {
      // threshold and owners
      expect(await ethersSafe.getThreshold()).to.equal(THRESHOLD);
      expect(await ethersSafe.getOwners()).to.deep.equal([alice.address, bob.address]);
      // check to see if module has been enabled
      expect(await ethersSafe.isModuleEnabled(controller.address)).to.equal(true);

      // check to see if guard has been enabled
      // strip off the address 0x for comparison
      expect(await safeContract.getStorageAt(GUARD_STORAGE_SLOT, 1)).to.include(
        controller.address.substring(2).toLowerCase(),
      );
    });

    it("set member token state correctly", async () => {
      expect(await memberToken.memberController(POD_ID)).to.equal(controller.address);
      // should mint member tokens
      expect(await memberToken.balanceOf(alice.address, POD_ID)).to.equal(1);
      expect(await memberToken.balanceOf(bob.address, POD_ID)).to.equal(1);
    });

    it("should set controller state correctly", async () => {
      const safeAddress = ethersSafe.getAddress();

      expect(await controller.podIdToSafe(POD_ID)).to.equal(safeAddress);
      expect(await controller.safeToPodId(safeAddress)).to.equal(POD_ID);
      // check admin
      expect(await controller.podAdmin(POD_ID)).to.equal(AddressZero);
      // check safe teller
      expect(await controller.areModulesLocked(safeAddress)).to.equal(false);
    });
  });

  describe("when creating new pod through createPodWithSafe with an admin", () => {
    let { signers, memberToken, ethersSafe, safeContract, createPodWithSafeHelper } = {};
    let [admin, alice, bob] = [];

    before(async () => {
      ({ signers, ethersSafe, memberToken, createPodWithSafeHelper } = await setup());

      [admin, alice, bob] = signers;
      // create pod with safe with admin
      ({ ethersSafe, safeContract } = await createPodWithSafeHelper(admin));
    });

    it("should set safe state correctly", async () => {
      // threshold and owners
      expect(await ethersSafe.getThreshold()).to.equal(THRESHOLD);
      expect(await ethersSafe.getOwners()).to.deep.equal([alice.address, bob.address]);
      // check to see if module has been enabled
      expect(await ethersSafe.isModuleEnabled(controller.address)).to.equal(true);
      // check to see if guard has been enabled
      // strip off the address 0x for comparison
      expect(await safeContract.getStorageAt(GUARD_STORAGE_SLOT, 1)).to.include(
        controller.address.substring(2).toLowerCase(),
      );
    });

    it("set member token state correctly", async () => {
      expect(await memberToken.memberController(POD_ID)).to.equal(controller.address);
      // should mint member tokens
      expect(await memberToken.balanceOf(alice.address, POD_ID)).to.equal(1);
      expect(await memberToken.balanceOf(bob.address, POD_ID)).to.equal(1);
    });

    it("should set controller state correctly", async () => {
      const safeAddress = ethersSafe.getAddress();

      expect(await controller.podIdToSafe(POD_ID)).to.equal(safeAddress);
      expect(await controller.safeToPodId(safeAddress)).to.equal(POD_ID);
      // check admin
      expect(await controller.podAdmin(POD_ID)).to.equal(admin.address);
      // check safe teller
      expect(await controller.areModulesLocked(safeAddress)).to.equal(true);
    });
  });
});
