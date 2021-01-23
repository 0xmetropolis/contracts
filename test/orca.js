const { expect, use } = require("chai");
const { waffle, ethers } = require("hardhat");

const OrcaProtocol = require("../artifacts/contracts/OrcaProtocol.sol/OrcaProtocol.json");
const OrcaMemberToken = require("../artifacts/contracts/OrcaMemberToken.sol/OrcaMemberToken.json");
const OrcaToken = require("../artifacts/contracts/OrcaToken.sol/OrcaToken.json");
const OrcaPodManager = require("../artifacts/contracts/OrcaPodManager.sol/OrcaPodManager.json");
const OrcaVoteManager = require("../artifacts/contracts/OrcaVoteManager.sol/OrcaVoteManager.json");

const { deployContract, provider, solidity } = waffle;

use(solidity);

describe("Orca Tests", () => {
  const [admin, host, member, other] = provider.getWallets();

  let orcaProtocol;
  let orcaToken;
  let orcaMemberToken;
  let orcaPodManager;
  let orcaVoteManager;

  it("should deploy contracts", async () => {
    orcaToken = await deployContract(admin, OrcaToken);
    orcaMemberToken = await deployContract(admin, OrcaMemberToken);
    orcaProtocol = await deployContract(admin, OrcaProtocol, [orcaMemberToken.address]);

    // Grab pod manager address from the constructor event
    const [podEvent] = await orcaProtocol.queryFilter("PodManagerAddress");
    orcaPodManager = new ethers.Contract(podEvent.args[0], OrcaPodManager.abi, admin);

    // Grab pod manager address from the constructor event
    const [voteEvent] = await orcaProtocol.queryFilter("VoteManagerAddress");
    orcaVoteManager = new ethers.Contract(voteEvent.args[0], OrcaVoteManager.abi, admin);
  });

  it("should create a pod", async () => {
    /*
    OrcaProtocol- createPod

    uint256 podId,
    uint256 totalSupply,
    address erc20Address,
    uint256 minimumBalance,
    uint256 votingPeriod,
    uint256 minQuorum
    */

    await expect(orcaProtocol.connect(host).createPod(1, 10, orcaToken.address, 5, 1, 1))
      .to.emit(orcaProtocol, "CreatePod")
      .withArgs(1)
      .to.emit(orcaPodManager, "CreateRule")
      .withArgs(1, orcaToken.address, 5)
      .to.emit(orcaVoteManager, "CreateVoteStrategy");
  });

  it("should not claim membership without min tokens", async () => {
    await expect(orcaPodManager.connect(host).claimMembership(1)).to.be.revertedWith("Not Enough Tokens");
  });

  it("should claim membership with min tokens", async () => {
    // can only use changeTokenBalance with ERC20/721
    await expect(() => orcaToken.connect(host).mint()).to.changeTokenBalance(orcaToken, host, 6);

    await expect(orcaPodManager.connect(host).claimMembership(1))
      .to.emit(orcaMemberToken, "TransferSingle")
      .withArgs(orcaPodManager.address, orcaPodManager.address, host.address, 1, 1);
  });

  it("should create a proposal to raise membership min tokens", async () => {
    await expect(() => orcaToken.connect(member).mint()).to.changeTokenBalance(orcaToken, member, 6);

    await orcaPodManager.connect(member).claimMembership(1);

    await expect(orcaVoteManager.connect(member).createProposal(1, orcaToken.address, 10))
      .to.emit(orcaVoteManager, "CreateProposal")
      .withArgs(1, orcaToken.address, 10, member.address);

    console.log(await orcaVoteManager.voteProposalByPod(1));

    expect().to.include(0, 0, true, orcaToken.address, 10);
  });
});
