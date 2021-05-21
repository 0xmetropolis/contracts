const { expect, use } = require("chai");
const { waffle, ethers } = require("hardhat");

const VoteManager = require("../artifacts/contracts/VoteManager.sol/VoteManager.json");

const { deployContract, provider, solidity } = waffle;

let voteManager;

use(solidity);

describe("VoteManager unit tests", () => {
  const [, admin, member1, member2] = provider.getWallets();

  const podId = 1;
  const minVotingPeriod = 1;
  const maxVotingPeriod = 1;
  const minQuorum = 1;
  const maxQuorum = 2;

  it("should deploy voteManager", async () => {
    voteManager = await deployContract(admin, VoteManager, [admin.address]);
  });

  it("should create a voting strategy", async () => {
    await expect(
      voteManager.connect(admin).createVotingStrategy(podId, minVotingPeriod, maxVotingPeriod, minQuorum, maxQuorum),
    )
      .to.emit(voteManager, "VoteStrategyUpdated")
      .withArgs(podId, minVotingPeriod, maxVotingPeriod, minQuorum, maxQuorum);

    const strategy = await voteManager.voteStrategiesByPod(podId);
    expect(strategy.minVotingPeriod).to.equal(minVotingPeriod);
    expect(strategy.maxVotingPeriod).to.equal(maxVotingPeriod);
    expect(strategy.minQuorum).to.equal(minQuorum);
    expect(strategy.maxQuorum).to.equal(maxQuorum);
  });

  const proposalId = 0; // should generate proposal Id
  const proposalType = 1; // 0 == Rule, 1 == Action
  const executableId = 1; // id of executable stored in rule/action book

  it("should create a new action proposal", async () => {
    await expect(voteManager.connect(admin).createProposal(podId, admin.address, proposalType, executableId))
      .to.emit(voteManager, "ProposalCreated")
      .withArgs(proposalId, podId, admin.address, proposalType, executableId);

    const proposal = await voteManager.proposalByPod(podId);
    expect(proposal.proposalId).to.equal(proposalId);
    expect(proposal.proposalType).to.equal(proposalType);
    expect(proposal.executableId).to.equal(executableId);
    expect(proposal.approvals).to.equal(0);
    expect(proposal.isChallenged).to.equal(false);
    expect(proposal.isOpen).to.equal(true);
    expect(proposal.didPass).to.equal(false);
  });

  it("should approve proposal", async () => {
    await expect(voteManager.connect(admin).approveProposal(podId, proposalId, member1.address))
      .to.emit(voteManager, "ProposalApproved")
      .withArgs(proposalId, podId, member1.address);

    expect(await voteManager.userHasVotedByProposal(proposalId, member1.address)).to.equal(true);

    const proposal = await voteManager.proposalByPod(podId);
    expect(proposal.approvals).to.equal(1);
  });

  it("should not double approve proposal", async () => {
    await expect(voteManager.connect(admin).approveProposal(podId, proposalId, member1.address)).to.be.revertedWith(
      "This member has already voted",
    );
  });

  it("should finalize proposal", async () => {
    await expect(voteManager.connect(admin).finalizeProposal(podId, proposalId))
      .to.emit(voteManager, "ProposalFinalized")
      .withArgs(podId, proposalId, true);

    const proposal = await voteManager.proposalByPod(podId);
    expect(proposal.didPass).to.equal(true);
    expect(proposal.isOpen).to.equal(false);
  });
});
