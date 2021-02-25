const { expect, use } = require("chai");
const { waffle, ethers } = require("hardhat");

const OrcaProtocol = require("../artifacts/contracts/OrcaProtocol.sol/OrcaProtocol.json");
const MemberToken = require("../artifacts/contracts/MemberToken.sol/MemberToken.json");
const OrcaToken = require("../artifacts/contracts/OrcaToken.sol/OrcaToken.json");
const PodManager = require("../artifacts/contracts/PodManager.sol/PodManager.json");
const VoteManager = require("../artifacts/contracts/VoteManager.sol/VoteManager.json");
const RuleManager = require("../artifacts/contracts/RuleManager.sol/RuleManager.json");

const GnosisSafeAbi = require("../abis/GnosisSafe.json");

const { deployContract, provider, solidity } = waffle;

use(solidity);

describe("Orca Tests", () => {
  const [admin, host, member, shepherd] = provider.getWallets();

  let orcaProtocol;
  let orcaToken;
  let memberToken;
  let podManager;
  let voteManager;
  let rulemanager;

  let podSafe;

  // create pod args
  const podId = 1;
  const totalSupply = 10;
  const balanceOfFunctionHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("balanceOf(address)"));
  const balanceOfFuncSig = ethers.utils.hexDataSlice(balanceOfFunctionHash, 0, 4);

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

  const masterGnosisContract = "0x34CfAC646f301356fAa8B21e94227e3583Fe3F5F";

  it("should deploy contracts", async () => {
    orcaToken = await deployContract(admin, OrcaToken);
    // memberToken = await deployContract(admin, MemberToken);
    orcaProtocol = await deployContract(admin, OrcaProtocol);

    // Grab pod manager address from the constructor event
    const [podEvent] = await orcaProtocol.queryFilter("PodManagerAddress");
    podManager = new ethers.Contract(podEvent.args[0], PodManager.abi, admin);

    // Grab pod manager address from the constructor event
    const [voteEvent] = await orcaProtocol.queryFilter("VoteManagerAddress");
    voteManager = new ethers.Contract(voteEvent.args[0], VoteManager.abi, admin);

    const [ruleEvent] = await orcaProtocol.queryFilter("RuleManagerAddress");
    rulemanager = new ethers.Contract(ruleEvent.args[0], RuleManager.abi, admin);

    const [memberEvent] = await podManager.queryFilter("MemberTokenAddress");
    memberToken = new ethers.Contract(memberEvent.args[0], MemberToken.abi, admin);
  });

  it("should create a pod", async () => {
    await expect(
      orcaProtocol.connect(host).createPod(podId, totalSupply, votingPeriod, minQuorum, masterGnosisContract),
    )
      .to.emit(orcaProtocol, "CreatePod")
      .withArgs(1)
      .to.emit(voteManager, "CreateVoteStrategy")
      .withArgs(1, 2, 1)
      .to.emit(voteManager, "CreateSafe");

    expect(await memberToken.balanceOf(host.address, 1)).to.equal(1);

    // query the new gnosis safe and confirm the voteManager is the only owner
    const safeAddress = await voteManager.safes(1);
    podSafe = new ethers.Contract(safeAddress, GnosisSafeAbi, admin);
    const podSafeOwners = await podSafe.getOwners();
    await expect(podSafeOwners.length).to.be.equal(1);
    await expect(podSafeOwners[0]).to.be.equal(voteManager.address);
  });

  it("should not claim second membership", async () => {
    await expect(podManager.connect(host).claimMembership(1)).to.be.revertedWith("User is already member");
  });

  it("should not claim membership without rule", async () => {
    await expect(podManager.connect(member).claimMembership(1)).to.be.revertedWith("No rule set");
  });

  it("should create a rule proposal to raise membership min tokens", async () => {
    // can only use changeTokenBalance with ERC20/721
    await expect(() => orcaToken.connect(host).mint()).to.changeTokenBalance(orcaToken, host, 6);

    await expect(
      voteManager
        .connect(host)
        .createRuleProposal(1, orcaToken.address, balanceOfFuncSig, params, comparisonLogic, 5),
    )
      .to.emit(voteManager, "CreateRuleProposal")
      .withArgs(1, 1, host.address);

    const voteProposal = await voteManager.voteProposalByPod(1);
    expect(voteProposal.proposalId).to.equal(1);
    expect(voteProposal.approveVotes).to.equal(0);
    expect(voteProposal.rejectVotes).to.equal(0);
    expect(voteProposal.pending).to.equal(true);
  });

  it("should cast a vote on a proposal", async () => {
    let voteProposal = await voteManager.voteProposalByPod(1);
    expect(voteProposal.approveVotes).to.equal(0);
    expect(voteProposal.rejectVotes).to.equal(0);

    await expect(voteManager.connect(host).vote(1, true))
      .to.emit(voteManager, "CastVote")
      .withArgs(1, 1, host.address, true);

    voteProposal = await voteManager.voteProposalByPod(1);
    expect(voteProposal.approveVotes).to.equal(1);
    expect(voteProposal.rejectVotes).to.equal(0);
  });

  it("should cast a duplicate vote and revert", async () => {
    await expect(voteManager.connect(host).vote(1, true)).to.be.revertedWith("This member has already voted");
  });

  it("should fail to finalize vote due to voting period", async () => {
    await expect(voteManager.connect(host).finalizeRuleVote(1, { gasLimit: "9500000" })).to.be.revertedWith(
      "The voting period has not ended",
    );
  });

  it("should finalize rule vote", async () => {
    // finalize proposal
    await expect(voteManager.connect(member).finalizeRuleVote(1, { gasLimit: "9500000" }))
      .to.emit(voteManager, "FinalizeProposal")
      .withArgs(1, 1, member.address, true)
      .to.emit(rulemanager, "UpdateRule")
      .withArgs(1, orcaToken.address, balanceOfFuncSig, params, comparisonLogic, comparisonValue);

    // confirm proposal no longer pending
    const voteProposal = await rulemanager.rulesByPod(1);
    expect(voteProposal.isFinalized).to.equal(true);
    expect(voteProposal.contractAddress).to.equal(orcaToken.address);
    expect(voteProposal.comparisonValue).to.equal(5);

    // add reward
  });

  it("should claim membership with min tokens", async () => {
    await expect(() => orcaToken.connect(member).mint()).to.changeTokenBalance(orcaToken, member, 6);

    await expect(podManager.connect(member).claimMembership(1, { gasLimit: "9500000" }))
      .to.emit(memberToken, "TransferSingle")
      .withArgs(podManager.address, podManager.address, member.address, 1, 1);

    expect(await memberToken.balanceOf(member.address, 1)).to.equal(1);
  });

  it("should create an Action Proposal", async () => {
    const encodedMint = orcaToken.interface.encodeFunctionData("mint");
    await expect(voteManager.connect(host).createActionProposal(1, orcaToken.address, 0, encodedMint))
      .to.emit(voteManager, "CreateActionProposal")
      .withArgs(2, 1, host.address, orcaToken.address, 0, encodedMint);
  });

  it("should cast a vote on an Action proposal", async () => {
    let voteProposal = await voteManager.voteProposalByPod(1);
    expect(voteProposal.approveVotes).to.equal(0);
    expect(voteProposal.rejectVotes).to.equal(0);

    await expect(voteManager.connect(host).vote(1, true))
      .to.emit(voteManager, "CastVote")
      .withArgs(1, 2, host.address, true);

    voteProposal = await voteManager.voteProposalByPod(1);
    expect(voteProposal.approveVotes).to.equal(1);
    expect(voteProposal.rejectVotes).to.equal(0);
  });

  it("should fail to finalize vote due to voting period", async () => {
    await expect(voteManager.connect(host).finalizeActionVote(1, { gasLimit: "9500000" })).to.be.revertedWith(
      "The voting period has not ended",
    );
  });

  it("should finalize action vote and mint more orcaTokens", async () => {
    const initialOrcaTokenSupply = await orcaToken.totalSupply();

    // finalize proposal
    await expect(voteManager.connect(member).finalizeActionVote(1, { gasLimit: "9500000" }))
      .to.emit(voteManager, "FinalizeProposal")
      .withArgs(1, 2, member.address, true)
      .to.emit(podSafe, "ExecutionSuccess");

    const updatedOrcaTokenSupply = await orcaToken.totalSupply();

    await expect(updatedOrcaTokenSupply.sub(initialOrcaTokenSupply)).to.equal(6);
  });

  // TODO: Good luck Steven
  // it("should not revoke a valid membership", async () => {
  //   await expect(podManager.connect(shephard).retractMembership(1, host.address)).to.be.revertedWith(
  //     "Rule Compliant",
  //   );
  // });
});
