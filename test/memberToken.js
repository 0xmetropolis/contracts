const { expect, use } = require("chai");
const { waffle, ethers } = require("hardhat");

const OrcaProtocol = require("../artifacts/contracts/OrcaProtocol.sol/OrcaProtocol.json");
const OrcaMemberToken = require("../artifacts/contracts/OrcaMemberToken.sol/OrcaMemberToken.json");
const OrcaToken = require("../artifacts/contracts/OrcaToken.sol/OrcaToken.json");
const OrcaPodManager = require("../artifacts/contracts/OrcaPodManager.sol/OrcaPodManager.json");
const OrcaVoteManager = require("../artifacts/contracts/OrcaVoteManager.sol/OrcaVoteManager.json");

const { deployContract, provider, solidity } = waffle;

let orcaMemberToken;

const podId = 1;
const totalSupply = 10;

use(solidity);

describe("OrcaMemberToken unit tests", () => {
  const [admin, member1, member2] = provider.getWallets();

  it("should deploy contracts", async () => {
    orcaMemberToken = await deployContract(admin, OrcaMemberToken);
  });

  it("should create a pod", async () => {
    await expect(orcaMemberToken.connect(admin).createPod(admin.address, podId, totalSupply, "0x"))
      .to.emit(orcaMemberToken, "TransferSingle")
      .withArgs(admin.address, "0x0000000000000000000000000000000000000000", admin.address, 1, 10);
  });

  it("should revert when attempting to create that same pod", async () => {
    await expect(orcaMemberToken.connect(admin).createPod(admin.address, podId, totalSupply, "0x")).to.be.revertedWith(
      "Pod already exists",
    );
  });

  it("should allow the pod manager to transfer their tokens", async () => {
    await expect(orcaMemberToken.connect(admin).safeTransferFrom(admin.address, member1.address, podId, 2, "0x"))
      .to.emit(orcaMemberToken, "TransferSingle")
      .withArgs(admin.address, admin.address, member1.address, 1, 2);
  });

  it("should allow the pod manager to transfer other user's tokens", async () => {
    await expect(orcaMemberToken.connect(admin).safeTransferFrom(member1.address, member2.address, podId, 1, "0x"))
      .to.emit(orcaMemberToken, "TransferSingle")
      .withArgs(admin.address, member1.address, member2.address, 1, 1);
  });

  it("should prevent a non-pod manager to transfer other user's tokens", async () => {
    await expect(
      orcaMemberToken.connect(member1).safeTransferFrom(member2.address, member1.address, podId, 1, "0x"),
    ).to.be.revertedWith("ERC1155: caller is not owner, token holder, or pod manager");
  });

  it("should allow a non-pod manager to transfer their own tokens", async () => {
    await expect(orcaMemberToken.connect(member1).safeTransferFrom(member1.address, member2.address, podId, 1, "0x"))
      .to.emit(orcaMemberToken, "TransferSingle")
      .withArgs(member1.address, member1.address, member2.address, 1, 1);
  });
});
