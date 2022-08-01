const { expect } = require("chai");
const { ethers, deployments } = require("hardhat");
const { labelhash } = require("@ensdomains/ensjs");

const GnosisSafe = require("@gnosis.pm/safe-contracts/build/artifacts/contracts/GnosisSafe.sol/GnosisSafe.json");

const { getPreviousModule, createSafeSigner } = require("./utils");

describe("Controller safe integration test", () => {
  let [admin, alice, bob, charlie] = [];

  let controller;

  const { HashZero, AddressZero } = ethers.constants;

  const TX_OPTIONS = { gasLimit: 4000000 };

  const THRESHOLD = 1;
  const POD_ID = 0;
  const IMAGE_URL = "https://orcaprotocol-nft.vercel.app/assets/testnet/00000001";

  // current controller being tested
  const CONTROLLER_LATEST = "ControllerV1.3";

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

  const safeExecutionHelper = async (ethersSafe, data) => {
    const tx = await ethersSafe.createTransaction({
      // lets us override to and value
      ...data,
      value: 0,
    });

    const { transactionResponse } = await ethersSafe.executeTransaction(tx);
    return transactionResponse.wait();
  };

  const setup = async ({ hasAdmin } = {}) => {
    await deployments.fixture(["Base", "Registrar", CONTROLLER_LATEST]);
    [admin, alice, bob, charlie] = await ethers.getSigners();

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

    const { ethersSafe } = await createPodHelper(hasAdmin ? admin.address : undefined);

    return {
      memberToken,
      ethersSafe,
      podEnsRegistrar,
    };
  };

  describe("when a pod has an admin", () => {
    let { ethersSafe } = {};
    beforeEach(async () => {
      ({ ethersSafe } = await setup({ hasAdmin: true }));
    });
    it("should let admin set new admin", async () => {
      await controller.connect(admin).updatePodAdmin(POD_ID, alice.address);
      expect(await controller.podAdmin(POD_ID)).to.equal(alice.address);
      const safe = await controller.podIdToSafe(POD_ID);
      expect(await controller.areModulesLocked(safe)).to.equal(true);
    });
    it("should let admin remove admin", async () => {
      await controller.connect(admin).updatePodAdmin(POD_ID, AddressZero);
      expect(await controller.podAdmin(POD_ID)).to.equal(AddressZero);
      const safe = await controller.podIdToSafe(POD_ID);
      expect(await controller.areModulesLocked(safe)).to.equal(false);
    });
    it("should let admin unlock modules", async () => {
      await controller.connect(admin).setPodModuleLock(POD_ID, false);

      const safe = await controller.podIdToSafe(POD_ID);
      expect(await controller.areModulesLocked(safe)).to.equal(false);
    });
    it("should throw if safe updates admin", async () => {
      await expect(
        safeExecutionHelper(ethersSafe, await controller.populateTransaction.updatePodAdmin(POD_ID, alice.address)),
      ).to.be.revertedWith("GS013"); // sdk throws safe failure error
    });
    it("should throw if user updates module lock", async () => {
      await expect(controller.connect(bob).setPodModuleLock(POD_ID, false)).to.be.revertedWith(
        "Must be admin to set module lock",
      );
    });
  });

  describe("when a pod has no admin", () => {
    it("should throw if member updates admin", async () => {
      await setup();

      await expect(controller.connect(alice).updatePodAdmin(POD_ID, alice.address)).to.be.revertedWith(
        "Only safe can add new admin",
      );
    });

    it("should let safe update admin", async () => {
      const { ethersSafe } = await setup();
      await safeExecutionHelper(ethersSafe, await controller.populateTransaction.updatePodAdmin(POD_ID, alice.address));

      expect(await controller.podAdmin(POD_ID)).to.equal(alice.address);
      const safe = await controller.podIdToSafe(POD_ID);
      expect(await controller.areModulesLocked(safe)).to.equal(true);
    });
  });

  describe("ejecting a safe", () => {
    async function checkEject({ ethersSafe, memberToken, podId }) {
      // Safe owners should be untouched.
      expect(await ethersSafe.getOwners()).to.deep.equal([alice.address, bob.address]);
      expect(await memberToken.balanceOf(alice.address, podId)).to.equal(0);
      expect(await memberToken.balanceOf(bob.address, podId)).to.equal(0);

      // // Checking if reverse resolver is zeroed.
      // expect(await publicResolver.name(namehash(ensName))).to.equal("");
      // // Checking if there is an owner for the node.
      // expect(await publicResolver["addr(bytes32)"](namehash(ensName))).to.equal(ethers.constants.AddressZero);
      // expect(await publicResolver.text(namehash(ensName), "podId")).to.equal("");
      // expect(await publicResolver.text(namehash(ensName), "avatar")).to.equal("");
    }

    it("should be able to eject a safe via an admin call", async () => {
      const { memberToken, ethersSafe } = await setup({ hasAdmin: true });
      // This is just to make sure the addr call works properly.
      // expect(await publicResolver["addr(bytes32)"](namehash("test.pod.eth"))).to.not.equal(
      //   ethers.constants.AddressZero,
      // );
      // expect((await ens.getName(podSafe.address)).name).to.equal("test.pod.eth");

      const safeAddress = await ethersSafe.getAddress();
      const previousModule = await getPreviousModule(safeAddress, controller.address, ethers.provider);
      await expect(controller.connect(admin).ejectSafe(POD_ID, labelhash("test"), previousModule))
        .to.emit(controller, "DeregisterPod")
        .withArgs(POD_ID);

      await checkEject({ ethersSafe, memberToken, podId: POD_ID });

      // // Checking reverse resolver is zeroed. Reverse resolver check happens separately.
      // expect((await ens.getName(safeAddress)).name).to.equal("");
      // expect(await ethersSafe.isModuleEnabled(controller.address)).to.equal(false);
    });

    it("should be able to eject a safe via a proposal (safe transaction)", async () => {
      const { ethersSafe, memberToken } = await setup();

      const previousModule = await getPreviousModule(
        await ethersSafe.getAddress(),
        controller.address,
        ethers.provider,
      );

      await safeExecutionHelper(
        ethersSafe,
        await controller.populateTransaction.ejectSafe(POD_ID, labelhash("test"), previousModule),
      );

      await checkEject({
        ethersSafe,
        memberToken,
        podId: POD_ID,
        ensName: "test",
      });

      // // Checking reverse resolver is zeroed.
      // expect(await publicResolver.name(namehash("noadmin.pod.eth"))).to.equal("");
      // expect((await ens.getName(noAdminPod.address)).name).to.equal("");

      // expect(await safeSigner.isModuleEnabled(controller.address)).to.equal(false);
    });

    it("should be able to eject pods that have had the module disabled", async () => {
      const { ethersSafe, memberToken } = await setup();

      const safeAddress = await ethersSafe.getAddress();
      const previousModule = await getPreviousModule(safeAddress, controller.address, ethers.provider);

      const { transactionResponse } = await ethersSafe.executeTransaction(
        await ethersSafe.getDisableModuleTx(controller.address),
      );
      await transactionResponse.wait();
      // eslint-disable-next-line no-unused-expressions
      expect(await ethersSafe.isModuleEnabled(controller.address)).to.be.false;

      await safeExecutionHelper(
        ethersSafe,
        await controller.populateTransaction.ejectSafe(POD_ID, labelhash("test"), previousModule),
      );

      await checkEject({
        ethersSafe,
        memberToken,
        podId: POD_ID,
        ensName: "test",
      });

      // // Reverse resolver does not get cleared.
      // expect((await ens.getName(noAdminPod.address)).name).to.equal("noadmin.pod.eth");
      // // We are able to clear out the public resolver, but not the actual reverse resolver.
      // // That's why this record gets cleared, but not the above one.
      // expect(await publicResolver.name(namehash("noadmin.pod.eth"))).to.equal("");
      // expect(await safeSigner.isModuleEnabled(controller.address)).to.equal(false);
    });

    // it("should be able to re-add a pod that was previously deregistered", async () => {
    //   const { memberToken, publicResolver, ens, podSafe, gnosisSafeProxyFactory, gnosisSafeMaster } = await setup();

    //   const previousModule = await getPreviousModule(podSafe.address, controller.address, provider);
    //   await controller.connect(admin).ejectSafe(POD_ID, labelhash("test"), previousModule);

    //   const nextId = (await memberToken.nextAvailablePodId()).toNumber();
    //   const newPod = await createPodWithExistingSafe(
    //     gnosisSafeProxyFactory,
    //     gnosisSafeMaster,
    //     "test",
    //     nextId,
    //     IMAGE_URL,
    //   );

    //   expect((await ens.getName(newPod.safeAddress)).name).to.equal("test.pod.eth");
    //   expect(await publicResolver["addr(bytes32)"](namehash("test.pod.eth"))).to.not.equal(
    //     ethers.constants.AddressZero,
    //   );
    //   expect(await controller.podIdToSafe(nextId)).to.equal(newPod.safeAddress);
    // });

    // it("should not allow users to deregister ENS names that don't belong to the safe", async () => {
    //   const { podSafe } = await setup();

    //   const previousModule = await getPreviousModule(podSafe.address, controller.address, provider);
    //   // Set up another pod just so we have a label to work with.
    //   await createPodSafe(admin.address, POD_ID + 1, labelhash("test2"), "test2.pod.eth");

    //   // Attempting to eject the original safe, but with the wrong label.
    //   await expect(controller.connect(admin).ejectSafe(POD_ID, labelhash("test2"), previousModule)).to.be.revertedWith(
    //     "safe and label didn't match",
    //   );
    // });

    it("should throw if a non-admin attempts to eject safe", async () => {
      const { ethersSafe } = await setup({ hasAdmin: true });

      const previousModule = await getPreviousModule(
        await ethersSafe.getAddress(),
        controller.address,
        ethers.provider,
      );
      await expect(controller.connect(alice).ejectSafe(POD_ID, labelhash("test"), previousModule)).to.be.revertedWith(
        "must be admin",
      );
    });

    it("should throw if ejecting a non-existent pod", async () => {
      const { ethersSafe } = await setup();

      const previousModule = await getPreviousModule(
        await ethersSafe.getAddress(),
        controller.address,
        ethers.provider,
      );
      await expect(
        controller.connect(alice).ejectSafe(POD_ID + 1, labelhash("test"), previousModule),
      ).to.be.revertedWith("pod not registered");
    });
  });
  describe("when minting membership tokens without rules", () => {
    it("should NOT allow a user to mint membership token", async () => {
      const { memberToken } = await setup();
      await expect(memberToken.connect(charlie).mint(charlie.address, POD_ID, HashZero, TX_OPTIONS)).to.be.revertedWith(
        "No Rules Set",
      );
    });
  });

  describe("burning membership tokens without rules", () => {
    it("should NOT allow a user to burn membership token with no rules", async () => {
      const { memberToken } = await setup();
      await expect(memberToken.connect(charlie).burn(bob.address, POD_ID, TX_OPTIONS)).to.be.revertedWith(
        "No Rules Set",
      );
    });
  });

  describe("when toggling transfer lock without a pod admin", () => {
    let { ethersSafe } = {};
    beforeEach(async () => {
      ({ ethersSafe } = await setup());
    });

    it("should allow safe to toggle transfer lock", async () => {
      await safeExecutionHelper(ethersSafe, await controller.populateTransaction.setPodTransferLock(POD_ID, true));

      expect(await controller.isTransferLocked(POD_ID)).to.equal(true);
    });
    it("should throw if user toggles transfer lock", async () => {
      await expect(controller.connect(bob).setPodTransferLock(POD_ID, true)).to.be.revertedWith(
        "Only safe can set transfer lock",
      );
    });
  });

  describe("when toggling transfer lock with a pod admin", () => {
    beforeEach(async () => {
      await setup({ hasAdmin: true });
    });

    it("should allow admin to toggle transfer lock", async () => {
      await controller.connect(admin).setPodTransferLock(POD_ID, true);
      expect(await controller.isTransferLocked(POD_ID)).to.equal(true);
    });
    it("should allow safe to toggle transfer lock", async () => {
      await controller.connect(admin).setPodTransferLock(POD_ID, true);
      expect(await controller.isTransferLocked(POD_ID)).to.equal(true);
    });
    it("should throw if user toggles transfer lock", async () => {
      await expect(controller.connect(bob).setPodTransferLock(POD_ID, true)).to.be.revertedWith(
        "Only admin or safe can set transfer lock",
      );
    });
  });

  describe("when transferring membership tokens with transfer lock", () => {
    let { memberToken } = {};
    beforeEach(async () => {
      ({ memberToken } = await setup({ hasAdmin: true }));
      await controller.connect(admin).setPodTransferLock(POD_ID, true);
    });

    it("should throw when user to transfer membership token", async () => {
      await expect(
        memberToken.connect(bob).safeTransferFrom(bob.address, charlie.address, POD_ID, 1, HashZero, TX_OPTIONS),
      ).to.revertedWith("Pod Is Transfer Locked");
    });
  });
});
