const { expect, use } = require("chai");
const { waffle, ethers, network, deployments } = require("hardhat");

const Safe = require("@gnosis.pm/safe-contracts/build/artifacts/contracts/GnosisSafe.sol/GnosisSafe.json");
const { labelhash } = require("@ensdomains/ensjs");
const { AddressOne } = require("@gnosis.pm/safe-contracts");

const { deployMockContract, solidity, provider } = waffle;

const { AddressZero, HashZero } = ethers.constants;

use(solidity);

describe("Controller beforeTokenTransfer Test", () => {
  const [admin, alice, bob, charlie] = provider.getWallets();

  const TX_OPTIONS = { gasLimit: 4000000 };

  // create pod args
  const POD_ID = 0;
  const MEMBERS = [alice.address, bob.address];
  const POD_LABEL = labelhash("test");
  const IMAGE_URL = "https://testurl/";

  // current controller being tested
  const CONTROLLER_LATEST = "ControllerV1.4";

  let controller;
  let memberToken;
  let safe;
  let safeSigner;

  const setupMockSafe = async members => {
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
    await deployments.fixture(["Base", "Registrar", CONTROLLER_LATEST]);

    controller = await ethers.getContract(CONTROLLER_LATEST, admin);
    memberToken = await ethers.getContract("MemberToken", admin);

    const podEnsRegistrar = await ethers.getContract("PodEnsRegistrar", admin);
    await podEnsRegistrar.setRestrictionState(2); // 2 == open enrollment

    safe = await deployMockContract(admin, Safe.abi);
    safeSigner = await setupMockSafe(MEMBERS);

    await controller.createPodWithSafe(admin.address, safe.address, POD_LABEL, TX_OPTIONS, POD_ID, IMAGE_URL);
  };

  it("should not let a user call beforeTokenTransfer function", async () => {
    await setup();

    await expect(
      controller.beforeTokenTransfer(admin.address, admin.address, alice.address, [POD_ID], [1], HashZero),
    ).to.be.revertedWith("Not Authorized");
  });

  describe("Pod Registrar functions", () => {
    it("should allow the owner to change the pod registrar", async () => {
      await setup();

      await controller.updatePodEnsRegistrar(AddressOne);
      expect(await controller.podEnsRegistrar()).to.equal(AddressOne);
    });

    it("should prevent non-owners to change the pod registrar", async () => {
      await setup();

      await expect(controller.connect(alice).updatePodEnsRegistrar(AddressOne)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
      expect(await controller.podEnsRegistrar()).to.not.equal(AddressOne);
    });
  });

  describe("when minting membership tokens without rules", () => {
    beforeEach(async () => {
      await setup();
    });

    it("should allow admin to mint membership token", async () => {
      await expect(memberToken.connect(admin).mint(charlie.address, POD_ID, HashZero, TX_OPTIONS))
        .to.emit(memberToken, "TransferSingle")
        .withArgs(admin.address, AddressZero, charlie.address, POD_ID, 1);
    });

    it("should allow pod to mint membership token", async () => {
      await expect(memberToken.connect(safeSigner).mint(charlie.address, POD_ID, HashZero, TX_OPTIONS))
        .to.emit(memberToken, "TransferSingle")
        .withArgs(safe.address, AddressZero, charlie.address, POD_ID, 1);
    });

    it("should NOT allow a user to mint membership token", async () => {
      await expect(memberToken.connect(charlie).mint(charlie.address, POD_ID, HashZero, TX_OPTIONS)).to.be.revertedWith(
        "No Rules Set",
      );
    });
  });

  describe("burning membership tokens without rules", () => {
    beforeEach(async () => {
      await setup();
    });

    it("should allow admin to burn membership token with no rules", async () => {
      await expect(memberToken.connect(admin).burn(bob.address, POD_ID, TX_OPTIONS))
        .to.emit(memberToken, "TransferSingle")
        .withArgs(admin.address, bob.address, AddressZero, POD_ID, 1);
    });

    it("should allow pod to burn membership token with no rules", async () => {
      await expect(memberToken.connect(safeSigner).burn(bob.address, POD_ID, TX_OPTIONS))
        .to.emit(memberToken, "TransferSingle")
        .withArgs(safe.address, bob.address, AddressZero, POD_ID, 1);
    });

    it("should NOT allow a user to burn membership token with no rules", async () => {
      await expect(memberToken.connect(charlie).burn(bob.address, POD_ID, TX_OPTIONS)).to.be.revertedWith(
        "No Rules Set",
      );
    });
  });

  describe("transferring membership tokens without rules", () => {
    beforeEach(async () => {
      await setup();
    });

    it("should allow user to transfer membership token with no rules", async () => {
      await expect(
        memberToken.connect(bob).safeTransferFrom(bob.address, charlie.address, POD_ID, 1, HashZero, TX_OPTIONS),
      )
        .to.emit(memberToken, "TransferSingle")
        .withArgs(bob.address, bob.address, charlie.address, POD_ID, 1);
    });
  });

  describe("when toggling transfer lock without a pod admin", () => {
    beforeEach(async () => {
      await setup();
      await controller.connect(admin).updatePodAdmin(POD_ID, AddressZero);
    });

    it("should allow safe to toggle transfer lock", async () => {
      await controller.connect(safeSigner).setPodTransferLock(POD_ID, true);
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
      await setup();
    });

    it("should allow admin to toggle transfer lock", async () => {
      await controller.connect(safeSigner).setPodTransferLock(POD_ID, true);
      expect(await controller.isTransferLocked(POD_ID)).to.equal(true);
    });
    it("should allow safe to toggle transfer lock", async () => {
      await controller.connect(safeSigner).setPodTransferLock(POD_ID, true);
      expect(await controller.isTransferLocked(POD_ID)).to.equal(true);
    });
    it("should throw if user toggles transfer lock", async () => {
      await expect(controller.connect(bob).setPodTransferLock(POD_ID, true)).to.be.revertedWith(
        "Only admin or safe can set transfer lock",
      );
    });
  });

  describe("when transferring membership tokens with transfer lock", () => {
    beforeEach(async () => {
      await setup();
      await controller.connect(safeSigner).setPodTransferLock(POD_ID, true);
    });

    it("should throw when user to transfer membership token", async () => {
      await expect(
        memberToken.connect(bob).safeTransferFrom(bob.address, charlie.address, POD_ID, 1, HashZero, TX_OPTIONS),
      ).to.revertedWith("Pod Is Transfer Locked");
    });
  });
});
