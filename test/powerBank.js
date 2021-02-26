const { expect, use } = require("chai");
const { waffle, ethers } = require("hardhat");

const OrcaProtocol = require("../artifacts/contracts/OrcaProtocol.sol/OrcaProtocol.json");
const PowerBank = require("../artifacts/contracts/PowerBank.sol/PowerBank.json");
const PowerToken = require("../artifacts/contracts/PowerBank.sol/PowerToken.json");
const OrcaToken = require("../artifacts/contracts/OrcaToken.sol/OrcaToken.json");
const VoteManager = require("../artifacts/contracts/VoteManager.sol/VoteManager.json");

const { deployContract, provider, solidity } = waffle;

let powerToken;
let powerBank;

const podId = 1;
const totalSupply = 10;

use(solidity);

describe("PowerBank unit tests", () => {
  const [admin, member1, member2] = provider.getWallets();

  it("should deploy contracts", async () => {
    // podManager = await deployContract(admin, PowerBank);

    // const [memberEvent] = await podManager.queryFilter("PowerBankAddress");
    // powerBank = new ethers.Contract(memberEvent.args[0], PowerBank.abi, admin);

    powerToken = await deployContract(admin, PowerToken);
    powerBank = await deployContract(admin, PowerBank, [powerToken.address]);
  });

  it("should create a pod, transfer 1 token to creator and totalSupply-1 to powerbank", async () => {
    await expect(powerBank.connect(admin).createPod(admin.address, podId, totalSupply))
      .to.emit(powerToken, "TransferSingle")
      .withArgs(
        powerBank.address,
        "0x0000000000000000000000000000000000000000",
        powerBank.address,
        podId,
        totalSupply - 1,
      )
      .to.emit(powerToken, "TransferSingle")
      .withArgs(powerBank.address, "0x0000000000000000000000000000000000000000", admin.address, podId, 1);
  });

  it("should revert when attempting to create that same pod", async () => {
    await expect(powerBank.connect(admin).createPod(admin.address, podId, totalSupply)).to.be.revertedWith(
      "Pod already exists",
    );
  });

  it("should allow the powerbank to transfer their tokens", async () => {
    await expect(powerToken.connect(admin).safeTransferFrom(powerBank.address, member1.address, podId, 3, "0x"))
      .to.emit(powerToken, "TransferSingle")
      .withArgs(admin.address, powerBank.address, member1.address, 1, 3);
  });

  it("should allow users to set the powerBank as operator", async () => {
    await expect(powerToken.connect(member1).setApprovalForAll(admin.address, true))
      .to.emit(powerToken, "ApprovalForAll")
      .withArgs(member1.address, admin.address, true);
  });

  it("should allow the pod manager to transfer other user's tokens", async () => {
    await expect(powerToken.connect(admin).safeTransferFrom(member1.address, member2.address, podId, 1, "0x"))
      .to.emit(powerToken, "TransferSingle")
      .withArgs(admin.address, member1.address, member2.address, 1, 1);
  });

  it("should prevent a non-pod manager to transfer other user's tokens", async () => {
    await expect(
      powerToken.connect(member1).safeTransferFrom(member2.address, member1.address, podId, 1, "0x"),
    ).to.be.revertedWith("ERC1155: caller is not owner nor approved");
  });

  // it("should prevent a non-pod manager to transfer their own tokens", async () => {
  //   await expect(
  //     powerBank.connect(member1).safeTransferFrom(member1.address, member2.address, podId, 1, "0x"),
  //   ).to.be.revertedWith("Only PowerBank can interact with these tokens");
  // });
});
