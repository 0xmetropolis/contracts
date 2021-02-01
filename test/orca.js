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
  const [admin, host, member, shepherd] = provider.getWallets();

  let orcaProtocol;
  let orcaToken;
  let orcaMemberToken;
  let orcaPodManager;
  let orcaVoteManager;

  // create pod args
  const podId = 1;
  const totalSupply = 10;
  const functionHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("balanceOf(address)"));
  const functionSignature = ethers.utils.hexDataSlice(functionHash, 0, 4);
  const param1 = ethers.utils.formatBytes32String("MEMBER");
  const param2 = ethers.utils.formatBytes32String("");
  const param3 = ethers.utils.formatBytes32String("");
  const param4 = ethers.utils.formatBytes32String("");
  const param5 = ethers.utils.formatBytes32String("");
  const params = [param1, param2, param3, param4, param5];
  // 0 is equal to, 1 is greaterThan, 2 is less than
  // ruleResult (comparison logic) (comparison value)
  const comparisonLogic = 1;
  const comparisonValue = 5;
  const votingPeriod = 2;
  const minQuorum = 1;

  it("should deploy contracts", async () => {
    orcaToken = await deployContract(admin, OrcaToken);
    // orcaMemberToken = await deployContract(admin, OrcaMemberToken);
    orcaProtocol = await deployContract(admin, OrcaProtocol);

    // Grab pod manager address from the constructor event
    const [podEvent] = await orcaProtocol.queryFilter("PodManagerAddress");
    orcaPodManager = new ethers.Contract(podEvent.args[0], OrcaPodManager.abi, admin);

    // Grab pod manager address from the constructor event
    const [voteEvent] = await orcaProtocol.queryFilter("VoteManagerAddress");
    orcaVoteManager = new ethers.Contract(voteEvent.args[0], OrcaVoteManager.abi, admin);

    const [memberEvent] = await orcaPodManager.queryFilter("MemberTokenAddress");
    orcaMemberToken = new ethers.Contract(memberEvent.args[0], OrcaMemberToken.abi, admin);
  });

  it("should create a pod", async () => {
    /* OrcaProtocol- createPod
          uint256 _podId,
          uint256 _totalSupply,
          address _contractAddress;
          bytes4 _functionSignature;
          bytes32[5] _functionParams;
          uint256 _comparisonLogic;
          uint256 _comparisonValue;
          uint256 _votingPeriod,
          uint256 _minQuorum
    */
    await expect(
      orcaProtocol
        .connect(host)
        .createPod(
          podId,
          totalSupply,
          orcaToken.address,
          functionSignature,
          params,
          comparisonLogic,
          comparisonValue,
          votingPeriod,
          minQuorum,
        ),
    )
      .to.emit(orcaProtocol, "CreatePod")
      .withArgs(1)
      .to.emit(orcaPodManager, "UpdateRule")
      .withArgs(1, orcaToken.address, functionSignature, params, comparisonLogic, comparisonValue)
      .to.emit(orcaVoteManager, "CreateVoteStrategy")
      .withArgs(1, 2, 1);
      // TODO: Check to see if tokens were distributed correctly.
  });

  it("should not claim membership without min tokens", async () => {
    await expect(orcaPodManager.connect(host).claimMembership(1)).to.be.revertedWith("Not Rule Compliant");
  });

  it("should claim membership with min tokens", async () => {
    // can only use changeTokenBalance with ERC20/721
    await expect(() => orcaToken.connect(host).mint()).to.changeTokenBalance(orcaToken, host, 6);

    await expect(orcaPodManager.connect(host).claimMembership(1, { gasLimit: "9500000" }))
      .to.emit(orcaMemberToken, "TransferSingle")
      .withArgs(orcaPodManager.address, orcaPodManager.address, host.address, 1, 1);

    expect(await orcaMemberToken.balanceOf(host.address, 1)).to.equal(1);
  });

  it("should prevent users from claiming membership when they are already a member", async () => {
    await expect(orcaPodManager.connect(host).claimMembership(1, { gasLimit: "9500000" }))
      .to.be.revertedWith("User is already member");
});

  it("should create a proposal to raise membership min tokens", async () => {
    // can only use changeTokenBalance with ERC20/721
    await expect(() => orcaToken.connect(member).mint()).to.changeTokenBalance(orcaToken, member, 6);

    await expect(
      orcaVoteManager
        .connect(member)
        .createProposal(1, orcaToken.address, functionSignature, params, comparisonLogic, 10),
    )
      .to.emit(orcaVoteManager, "CreateProposal")
      .withArgs(1, 1, orcaToken.address, functionSignature, params, comparisonLogic, 10, member.address);

    const voteProposal = await orcaVoteManager.voteProposalByPod(1);
    expect(voteProposal.proposalId).to.equal(1);
    expect(voteProposal.approveVotes).to.equal(0);
    expect(voteProposal.rejectVotes).to.equal(0);
    expect(voteProposal.pending).to.equal(true);
  });

  it("should cast a vote on a proposal", async () => {
    let voteProposal = await orcaVoteManager.voteProposalByPod(1);
    expect(voteProposal.approveVotes).to.equal(0);
    expect(voteProposal.rejectVotes).to.equal(0);

    await expect(orcaVoteManager.connect(member).vote(1, true))
      .to.emit(orcaVoteManager, "CastVote")
      .withArgs(1, 1, member.address, true);

    voteProposal = await orcaVoteManager.voteProposalByPod(1);
    expect(voteProposal.approveVotes).to.equal(1);
    expect(voteProposal.rejectVotes).to.equal(0);
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
      .withArgs(1, orcaToken.address, functionSignature, params, comparisonLogic, 10);

    // confirm proposal no longer pending
    const voteProposal = await orcaVoteManager.voteProposalByPod(1);
    expect(voteProposal.pending).to.equal(false);

    // confirm rule updated
    // confirm proposal no longer pending
    const podRule = await orcaPodManager.rulesByPod(1);
    expect(podRule.contractAddress).to.equal(orcaToken.address);
    expect(podRule.comparisonValue).to.equal(10);

    // add reward
  });

  // TODO: Good luck Steven
  // it("should not revoke a valid membership", async () => {
  //   await expect(orcaPodManager.connect(shephard).retractMembership(1, host.address)).to.be.revertedWith(
  //     "Rule Compliant",
  //   );
  // });
});
