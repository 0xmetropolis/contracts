const { expect, use } = require("chai");
const { waffle, ethers } = require("hardhat");

const OrcaProtocol = require("../artifacts/contracts/OrcaProtocol.sol/OrcaProtocol.json");
const OrcaMemberToken = require("../artifacts/contracts/OrcaMemberToken.sol/OrcaMemberToken.json");
const OrcaToken = require("../artifacts/contracts/OrcaToken.sol/OrcaToken.json");
const OrcaPodManager = require("../artifacts/contracts/OrcaPodManager.sol/OrcaPodManager.json");
const OrcaVoteManager = require("../artifacts/contracts/OrcaVoteManager.sol/OrcaVoteManager.json");

const { deployContract, provider, solidity } = waffle;

let orcaPodManager;
let orcaMemberToken;

const podId = 1;
const totalSupply = 10;

use(solidity);

describe("OrcaMemberToken unit tests", () => {
  const [admin, member1, member2] = provider.getWallets();

  it("should deploy contracts", async () => {
    // orcaPodManager = await deployContract(admin, OrcaPodManager);

    // const [memberEvent] = await orcaPodManager.queryFilter("MemberTokenAddress");
    // orcaMemberToken = new ethers.Contract(memberEvent.args[0], OrcaMemberToken.abi, admin);

    orcaMemberToken = await deployContract(admin, OrcaMemberToken, [admin.address]);
  });

  it("should create a pod", async () => {
    await expect(orcaMemberToken.connect(admin).createPod(admin.address, podId, totalSupply))
      .to.emit(orcaMemberToken, "TransferSingle")
      .withArgs(admin.address, "0x0000000000000000000000000000000000000000", admin.address, podId, totalSupply - 1)
      .to.emit(orcaMemberToken, "TransferSingle")
      .withArgs(admin.address, "0x0000000000000000000000000000000000000000", admin.address, podId, 1);
  });

  it("should revert when attempting to create that same pod", async () => {
    await expect(orcaMemberToken.connect(admin).createPod(admin.address, podId, totalSupply)).to.be.revertedWith(
      "Pod already exists",
    );
  });

  it("should allow the pod manager to transfer their tokens", async () => {
    await expect(orcaMemberToken.connect(admin).safeTransferFrom(admin.address, member1.address, podId, 3, "0x"))
      .to.emit(orcaMemberToken, "TransferSingle")
      .withArgs(admin.address, admin.address, member1.address, 1, 3);
  });

  it("should allow users to set the podManager as operator", async () => {
    await expect(orcaMemberToken.connect(member1).setApprovalForAll(admin.address, true))
        .to.emit(orcaMemberToken, "ApprovalForAll")
        .withArgs(member1.address, admin.address, true);
  })

  it("should allow the pod manager to transfer other user's tokens", async () => {
    await expect(orcaMemberToken.connect(admin).safeTransferFrom(member1.address, member2.address, podId, 1, "0x"))
      .to.emit(orcaMemberToken, "TransferSingle")
      .withArgs(admin.address, member1.address, member2.address, 1, 1);
  });

  it("should prevent a non-pod manager to transfer other user's tokens", async () => {
    await expect(
      orcaMemberToken.connect(member1).safeTransferFrom(member2.address, member1.address, podId, 1, "0x"),
    ).to.be.revertedWith("ERC1155: caller is not owner nor approved");
  });

  it("should prevent a non-pod manager to transfer their own tokens", async () => {
    await expect(orcaMemberToken.connect(member1).safeTransferFrom(member1.address, member2.address, podId, 1, "0x"))
      .to.be.revertedWith("Only OrcaPodManager can interact with these tokens");
  });
});
