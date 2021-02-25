const { expect, use } = require("chai");
const { waffle, ethers } = require("hardhat");

const OrcaProtocol = require("../artifacts/contracts/OrcaProtocol.sol/OrcaProtocol.json");
const MemberToken = require("../artifacts/contracts/MemberToken.sol/MemberToken.json");
const OrcaToken = require("../artifacts/contracts/OrcaToken.sol/OrcaToken.json");
const PodManager = require("../artifacts/contracts/PodManager.sol/PodManager.json");
const VoteManager = require("../artifacts/contracts/VoteManager.sol/VoteManager.json");

const { deployContract, provider, solidity } = waffle;

let podManager;
let memberToken;

const podId = 1;
const totalSupply = 10;

use(solidity);

describe("MemberToken unit tests", () => {
  const [admin, member1, member2] = provider.getWallets();

  it("should deploy contracts", async () => {
    // podManager = await deployContract(admin, PodManager);

    // const [memberEvent] = await podManager.queryFilter("MemberTokenAddress");
    // memberToken = new ethers.Contract(memberEvent.args[0], MemberToken.abi, admin);

    memberToken = await deployContract(admin, MemberToken, [admin.address]);
  });

  it("should create a pod", async () => {
    await expect(memberToken.connect(admin).createPod(admin.address, podId, totalSupply))
      .to.emit(memberToken, "TransferSingle")
      .withArgs(admin.address, "0x0000000000000000000000000000000000000000", admin.address, podId, totalSupply - 1)
      .to.emit(memberToken, "TransferSingle")
      .withArgs(admin.address, "0x0000000000000000000000000000000000000000", admin.address, podId, 1);
  });

  it("should revert when attempting to create that same pod", async () => {
    await expect(memberToken.connect(admin).createPod(admin.address, podId, totalSupply)).to.be.revertedWith(
      "Pod already exists",
    );
  });

  it("should allow the pod manager to transfer their tokens", async () => {
    await expect(memberToken.connect(admin).safeTransferFrom(admin.address, member1.address, podId, 3, "0x"))
      .to.emit(memberToken, "TransferSingle")
      .withArgs(admin.address, admin.address, member1.address, 1, 3);
  });

  it("should allow users to set the podManager as operator", async () => {
    await expect(memberToken.connect(member1).setApprovalForAll(admin.address, true))
      .to.emit(memberToken, "ApprovalForAll")
      .withArgs(member1.address, admin.address, true);
  });

  it("should allow the pod manager to transfer other user's tokens", async () => {
    await expect(memberToken.connect(admin).safeTransferFrom(member1.address, member2.address, podId, 1, "0x"))
      .to.emit(memberToken, "TransferSingle")
      .withArgs(admin.address, member1.address, member2.address, 1, 1);
  });

  it("should prevent a non-pod manager to transfer other user's tokens", async () => {
    await expect(
      memberToken.connect(member1).safeTransferFrom(member2.address, member1.address, podId, 1, "0x"),
    ).to.be.revertedWith("ERC1155: caller is not owner nor approved");
  });

  it("should prevent a non-pod manager to transfer their own tokens", async () => {
    await expect(
      memberToken.connect(member1).safeTransferFrom(member1.address, member2.address, podId, 1, "0x"),
    ).to.be.revertedWith("Only PodManager can interact with these tokens");
  });
});
