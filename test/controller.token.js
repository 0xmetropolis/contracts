const { expect, use } = require("chai");
const { waffle, ethers, network } = require("hardhat");

const Safe = require("@gnosis.pm/safe-contracts/build/artifacts/contracts/GnosisSafe.sol/GnosisSafe.json");
const ControllerRegistry = require("../artifacts/contracts/ControllerRegistry.sol/ControllerRegistry.json");
const Controller = require("../artifacts/contracts/Controller.sol/Controller.json");
const MemberToken = require("../artifacts/contracts/MemberToken.sol/MemberToken.json");

const { deployContract, deployMockContract, solidity, provider } = waffle;

const { AddressZero, HashZero } = ethers.constants;

use(solidity);

describe("Controller beforeTokenTransfer Test", () => {
  const [admin, proxyFactory, safeMaster, alice, bob, charlie] = provider.getWallets();

  const TX_OPTIONS = { gasLimit: 4000000 };

  // create pod args
  const POD_ID = 0;
  const MEMBERS = [alice.address, bob.address];

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
    const controllerRegistry = await deployMockContract(admin, ControllerRegistry.abi);
    await controllerRegistry.mock.isRegistered.returns(true);

    memberToken = await deployContract(admin, MemberToken, [controllerRegistry.address]);
    controller = await deployContract(admin, Controller, [
      memberToken.address,
      controllerRegistry.address,
      proxyFactory.address,
      safeMaster.address,
    ]);

    safe = await deployMockContract(admin, Safe.abi);

    safeSigner = await setupMockSafe(MEMBERS);

    await controller.createPodWithSafe(admin.address, safe.address, TX_OPTIONS);
  };

  it("should not let a user call beforeTokenTransfer function", async () => {
    await setup();

    await expect(
      controller.beforeTokenTransfer(admin.address, admin.address, alice.address, [POD_ID], [1], HashZero),
    ).to.be.revertedWith("Not Authorized");
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

  // describe("managing membership tokens of rule compliant user", () => {
  //   beforeEach(async () => {
  //     await setup();
  //     await ruleManager.mock.hasRules.returns(true);
  //     await ruleManager.mock.isRuleCompliant.returns(true);
  //   });

  //   it("should allow rule compliant user to mint membership token", async () => {
  //     await expect(memberToken.connect(charlie).mint(charlie.address, POD_ID, HashZero, TX_OPTIONS))
  //       .to.emit(memberToken, "TransferSingle")
  //       .withArgs(charlie.address, AddressZero, charlie.address, POD_ID, 1);
  //   });

  //   it("should allow rule compliant user to be transferred membership token", async () => {
  //     await expect(
  //       memberToken.connect(bob).safeTransferFrom(bob.address, charlie.address, POD_ID, 1, HashZero, TX_OPTIONS),
  //     )
  //       .to.emit(memberToken, "TransferSingle")
  //       .withArgs(bob.address, bob.address, charlie.address, POD_ID, 1);
  //   });

  //   it("should NOT allow a user to burn membership token with no rules", async () => {
  //     await expect(memberToken.connect(charlie).burn(bob.address, POD_ID, TX_OPTIONS)).to.be.revertedWith(
  //       "Rule Compliant",
  //     );
  //   });
  // });

  // describe("managing membership tokens of rule non-compliant user", () => {
  //   beforeEach(async () => {
  //     await setup();
  //     await ruleManager.mock.hasRules.returns(true);
  //     await ruleManager.mock.isRuleCompliant.returns(false);
  //   });

  //   it("should NOT allow rule non-compliant user to mint membership token", async () => {
  //     await expect(memberToken.connect(charlie).mint(charlie.address, POD_ID, HashZero, TX_OPTIONS)).to.be.revertedWith(
  //       "Not Rule Compliant",
  //     );
  //   });

  //   it("should NOT allow rule non-compliant user to be transferred a membership token", async () => {
  //     await expect(
  //       memberToken.connect(bob).safeTransferFrom(bob.address, charlie.address, POD_ID, 1, HashZero, TX_OPTIONS),
  //     ).to.be.revertedWith("Not Rule Compliant");
  //   });

  //   it("should allow a user to burn membership token of a rule non-compliant user", async () => {
  //     await expect(memberToken.connect(charlie).burn(bob.address, POD_ID, TX_OPTIONS))
  //       .to.emit(memberToken, "TransferSingle")
  //       .withArgs(charlie.address, bob.address, AddressZero, POD_ID, 1);
  //   });
  // });
});
