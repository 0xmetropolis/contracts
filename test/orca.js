const { expect, use } = require("chai");
const { waffle, ethers } = require("hardhat");

const OrcaProtocol = require("../artifacts/contracts/OrcaProtocol.sol/OrcaProtocol.json");
const OrcaMemberToken = require("../artifacts/contracts/OrcaMemberToken.sol/OrcaMemberToken.json");
const OrcaToken = require("../artifacts/contracts/OrcaToken.sol/OrcaToken.json");
const OrcaPodManager = require("../artifacts/contracts/OrcaPodManager.sol/OrcaPodManager.json");
const OrcaVoteManager = require("../artifacts/contracts/OrcaVoteManager.sol/OrcaVoteManager.json");

const { deployContract, provider, solidity } = waffle;

use(solidity);

// These tests test the end-to-end user flow.

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

    await expect(orcaProtocol.connect(host).createPod(1, 10, orcaToken.address, 5, 2, 1))
      .to.emit(orcaProtocol, "CreatePod")
      .withArgs(1)
      .to.emit(orcaPodManager, "CreateRule")
      .withArgs(1, orcaToken.address, 5)
      .to.emit(orcaVoteManager, "CreateVoteStrategy")
      .withArgs(1, 2, 1);
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
    await expect(orcaVoteManager.connect(member).createProposal(1, orcaToken.address, 10))
      .to.emit(orcaVoteManager, "CreateProposal")
      .withArgs(1, 1, orcaToken.address, 10, member.address);

    const voteProposal = await orcaVoteManager.voteProposalByPod(1);

    await expect(voteProposal.proposalId).to.equal(1);
    await expect(voteProposal.approveVotes).to.equal(0);
    await expect(voteProposal.rejectVotes).to.equal(0);
    await expect(voteProposal.pending).to.equal(true);
    await expect(voteProposal.ruleAddress).to.equal(orcaToken.address);
    await expect(voteProposal.ruleMinBalance).to.equal(10);
  });

  it("should cast a vote on a proposal", async () => {
    let voteProposal = await orcaVoteManager.voteProposalByPod(1);
    await expect(voteProposal.approveVotes).to.equal(0);
    await expect(voteProposal.rejectVotes).to.equal(0);

    await expect(orcaVoteManager.connect(member).vote(1, true))
      .to.emit(orcaVoteManager, "CastVote")
      .withArgs(1, 1, member.address, true);

    voteProposal = await orcaVoteManager.voteProposalByPod(1);
    await expect(voteProposal.approveVotes).to.equal(1);
    await expect(voteProposal.rejectVotes).to.equal(0);
  });

  it("should cast a duplicate vote and revert", async () => {
    await expect(orcaVoteManager.connect(member).vote(1, true)).to.be.revertedWith("This member has already voted");
  });

  it("should fail to finalize vote due to voting period", async () => {
    await expect(orcaVoteManager.connect(member).finalizeVote(1, { gasLimit: "9500000" })).to.be.revertedWith(
      "The voting period has not ended",
    );
  });

  it("should finalize vote", async () => {
    // finalize proposal
    await expect(orcaVoteManager.connect(member).finalizeVote(1, { gasLimit: "9500000" }))
      .to.emit(orcaVoteManager, "FinalizeProposal")
      .withArgs(1, 1, member.address, true)
      .to.emit(orcaPodManager, "UpdateRule")
      .withArgs(1, orcaToken.address, 10);

    // confirm proposal no longer pending
    const voteProposal = await orcaVoteManager.voteProposalByPod(1);
    await expect(voteProposal.pending).to.equal(false);

    // confirm rule updated
    // confirm proposal no longer pending
    const podRule = await orcaPodManager.rulesByPod(1);

    await expect(podRule.contractAddress).to.equal(orcaToken.address);
    await expect(podRule.minBalance).to.equal(10);

    // add reward
  });
});
