const { expect } = require("chai");
const { ethers, deployments } = require("hardhat");

const { labelhash } = require("@ensdomains/ensjs");

const GnosisSafe = require("@gnosis.pm/safe-contracts/build/artifacts/contracts/GnosisSafe.sol/GnosisSafe.json");

const { createSafeSigner } = require("./utils");

describe("manage members integration test", () => {
  let controller;

  const { AddressZero, HashZero } = ethers.constants;

  const TX_OPTIONS = { gasLimit: 4000000 };

  const THRESHOLD = 1;
  const POD_ID = 0;
  const IMAGE_URL = "https://orcaprotocol-nft.vercel.app/assets/testnet/00000001";

  // current controller being tested
  const CONTROLLER_LATEST = "ControllerV1.3";

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

    const safeExecutionHelper = async (ethersSafe, data) => {
      const tx = await ethersSafe.createTransaction({
        // lets us override to and value
        ...data,
        value: 0,
      });

      const { transactionResponse } = await ethersSafe.executeTransaction(tx);
      return transactionResponse.wait();
    };

    return {
      chainId,
      memberToken,
      podEnsRegistrar,
      signers,
      createPodHelper,
      safeExecutionHelper,
    };
  };

  describe("when managing members as safe", () => {
    let { signers, memberToken, ethersSafe, createPodHelper, safeExecutionHelper } = {};
    let [, , , charlie, dave] = [];

    beforeEach(async () => {
      ({ signers, ethersSafe, memberToken, createPodHelper, safeExecutionHelper } = await setup());

      [, , , charlie, dave] = signers;
      // create pod no admin
      ({ ethersSafe } = await createPodHelper());
    });

    it("should mint member", async () => {
      await safeExecutionHelper(
        ethersSafe,
        await memberToken.populateTransaction.mint(charlie.address, POD_ID, HashZero),
      );

      expect(await memberToken.balanceOf(charlie.address, POD_ID)).to.eq(1);
      expect(await ethersSafe.isOwner(charlie.address)).to.eq(true);
    });

    it("should mint multiple members", async () => {
      await safeExecutionHelper(
        ethersSafe,
        await memberToken.populateTransaction.mintSingleBatch([charlie.address, dave.address], POD_ID, HashZero),
      );

      expect(await memberToken.balanceOf(charlie.address, POD_ID)).to.eq(1);
      expect(await memberToken.balanceOf(dave.address, POD_ID)).to.eq(1);
      expect(await ethersSafe.isOwner(charlie.address)).to.eq(true);
      expect(await ethersSafe.isOwner(dave.address)).to.eq(true);
    });

    it("should burn member", async () => {
      await safeExecutionHelper(
        ethersSafe,
        await memberToken.populateTransaction.mint(charlie.address, POD_ID, HashZero),
      );
      await safeExecutionHelper(ethersSafe, await memberToken.populateTransaction.burn(charlie.address, POD_ID));

      expect(await memberToken.balanceOf(charlie.address, POD_ID)).to.eq(0);
      expect(await ethersSafe.isOwner(charlie.address)).to.eq(false);
    });

    it("should mint multiple members", async () => {
      await safeExecutionHelper(
        ethersSafe,
        await memberToken.populateTransaction.mintSingleBatch([charlie.address, dave.address], POD_ID, HashZero),
      );
      await safeExecutionHelper(
        ethersSafe,
        await memberToken.populateTransaction.burnSingleBatch([charlie.address, dave.address], POD_ID),
      );

      expect(await memberToken.balanceOf(charlie.address, POD_ID)).to.eq(0);
      expect(await memberToken.balanceOf(dave.address, POD_ID)).to.eq(0);
      expect(await ethersSafe.isOwner(charlie.address)).to.eq(false);
      expect(await ethersSafe.isOwner(dave.address)).to.eq(false);
    });
  });

  describe("when managing members as admin", () => {
    let { signers, memberToken, ethersSafe, createPodHelper } = {};
    let [admin, , , charlie, dave] = [];

    beforeEach(async () => {
      ({ signers, ethersSafe, memberToken, createPodHelper } = await setup());

      [admin, , , charlie, dave] = signers;
      // create pod with admin
      ({ ethersSafe } = await createPodHelper(admin));
    });

    it("should mint member", async () => {
      await memberToken.connect(admin).mint(charlie.address, POD_ID, HashZero);

      expect(await memberToken.balanceOf(charlie.address, POD_ID)).to.eq(1);
      expect(await ethersSafe.isOwner(charlie.address)).to.eq(true);
    });

    it("should mint multiple members", async () => {
      await memberToken.connect(admin).mintSingleBatch([charlie.address, dave.address], POD_ID, HashZero);

      expect(await memberToken.balanceOf(charlie.address, POD_ID)).to.eq(1);
      expect(await memberToken.balanceOf(dave.address, POD_ID)).to.eq(1);
      expect(await ethersSafe.isOwner(charlie.address)).to.eq(true);
      expect(await ethersSafe.isOwner(dave.address)).to.eq(true);
    });

    it("should burn member", async () => {
      await memberToken.connect(admin).mint(charlie.address, POD_ID, HashZero);
      await memberToken.connect(admin).burn(charlie.address, POD_ID);

      expect(await memberToken.balanceOf(charlie.address, POD_ID)).to.eq(0);
      expect(await ethersSafe.isOwner(charlie.address)).to.eq(false);
    });

    it("should mint multiple members", async () => {
      await memberToken.connect(admin).mintSingleBatch([charlie.address, dave.address], POD_ID, HashZero);
      await memberToken.connect(admin).burnSingleBatch([charlie.address, dave.address], POD_ID);

      expect(await memberToken.balanceOf(charlie.address, POD_ID)).to.eq(0);
      expect(await memberToken.balanceOf(dave.address, POD_ID)).to.eq(0);
      expect(await ethersSafe.isOwner(charlie.address)).to.eq(false);
      expect(await ethersSafe.isOwner(dave.address)).to.eq(false);
    });
  });

  describe("when managing your own membership", () => {
    let { signers, memberToken, ethersSafe, createPodHelper } = {};
    let [, alice, , charlie] = [];

    before(async () => {
      ({ signers, ethersSafe, memberToken, createPodHelper } = await setup());

      [, alice, , charlie] = signers;
      // create pod no admin
      ({ ethersSafe } = await createPodHelper());
    });

    it("should transfer membership", async () => {
      await memberToken.connect(alice).safeTransferFrom(alice.address, charlie.address, POD_ID, 1, HashZero);

      expect(await memberToken.balanceOf(alice.address, POD_ID)).to.eq(0);
      expect(await ethersSafe.isOwner(alice.address)).to.eq(false);

      expect(await memberToken.balanceOf(charlie.address, POD_ID)).to.eq(1);
      expect(await ethersSafe.isOwner(charlie.address)).to.eq(true);
    });
  });
});
