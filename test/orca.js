const { expect, use } = require("chai");
const { waffle, ethers } = require("hardhat");

const OrcaProtocol = require("../artifacts/contracts/OrcaProtocol.sol/OrcaProtocol.json");
const MemberToken = require("../artifacts/contracts/MemberToken.sol/MemberToken.json");
const OrcaToken = require("../artifacts/contracts/OrcaToken.sol/OrcaToken.json");
const VoteManager = require("../artifacts/contracts/VoteManager.sol/VoteManager.json");
const RuleManager = require("../artifacts/contracts/RuleManager.sol/RuleManager.json");
const SafeTeller = require("../artifacts/contracts/SafeTeller.sol/SafeTeller.json");

const GnosisSafeAbi = require("../abis/GnosisSafe.json");

const { deployContract, provider, solidity } = waffle;

const { AddressZero } = ethers.constants;

use(solidity);

describe("Orca Tests", () => {
  const [admin, owner, member] = provider.getWallets();

  let orcaProtocol;
  let orcaToken;
  let memberToken;
  let voteManager;
  let ruleManager;
  let safeTeller;

  let podSafe;

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

  // create pod args
  const POD_ID = 1;
  const MIN_VOTING_PERIOD = 1;
  const MAX_VOTING_PERIOD = 1;
  const MIN_QUORUM = 1;
  const MAX_QUORUM = 1;

  before(async () => {
    orcaToken = await deployContract(admin, OrcaToken);

    memberToken = await deployContract(admin, MemberToken);
    ruleManager = await deployContract(admin, RuleManager);
    voteManager = await deployContract(admin, VoteManager, [admin.address]);
    safeTeller = await deployContract(admin, SafeTeller);

    orcaProtocol = await deployContract(admin, OrcaProtocol, [
      memberToken.address,
      voteManager.address,
      ruleManager.address,
      safeTeller.address,
    ]);

    await memberToken.connect(admin).updateController(orcaProtocol.address);
    await ruleManager.connect(admin).updateController(orcaProtocol.address);
    await voteManager.connect(admin).updateController(orcaProtocol.address);
    await safeTeller.connect(admin).updateController(orcaProtocol.address);
  });

  it("should create a pod", async () => {
    await expect(
      orcaProtocol
        .connect(owner)
        .createPod(owner.address, POD_ID, MIN_VOTING_PERIOD, MAX_VOTING_PERIOD, MIN_QUORUM, MAX_QUORUM),
    ).to.emit(safeTeller, "CreateSafe");

    expect(await memberToken.balanceOf(owner.address, 1)).to.equal(1);

    // query the new gnosis safe and confirm the voteManager is the only owner
    const safeAddress = await orcaProtocol.safeAddress(POD_ID);
    podSafe = new ethers.Contract(safeAddress, GnosisSafeAbi, admin);
    const podSafeOwners = await podSafe.getOwners();
    expect(podSafeOwners.length).to.be.equal(1);
    expect(podSafeOwners[0]).to.be.equal(safeTeller.address);
  });

  it("should not claim membership without rule", async () => {
    await expect(orcaProtocol.connect(member).claimMembership(POD_ID)).to.be.revertedWith("No rule set");
  });

  const RULE_PROPOSAL_ID = 1;

  it("should create a rule proposal to raise membership min tokens", async () => {
    // can only use changeTokenBalance with ERC20/721
    await expect(() => orcaToken.connect(owner).mint()).to.changeTokenBalance(orcaToken, owner, 6);

    await expect(
      orcaProtocol
        .connect(owner)
        .createRuleProposal(POD_ID, orcaToken.address, balanceOfFuncSig, params, comparisonLogic, 5),
    ).to.emit(voteManager, "ProposalCreated");

    const voteProposal = await voteManager.proposalByPod(POD_ID);
    expect(voteProposal.proposalId).to.equal(RULE_PROPOSAL_ID);
    expect(voteProposal.approvals).to.equal(1);
  });

  it("should not cast a vote without power", async () => {
    await expect(orcaProtocol.connect(member).approve(RULE_PROPOSAL_ID, POD_ID, member.address)).to.be.revertedWith(
      "User lacks power",
    );
  });

  it("should cast a duplicate vote and revert", async () => {
    await expect(orcaProtocol.connect(owner).approve(RULE_PROPOSAL_ID, POD_ID, owner.address)).to.be.revertedWith(
      "This member has already voted",
    );
  });

  it("should finalize rule vote", async () => {
    // increment block
    await ethers.provider.send("evm_mine");
    // finalize proposal
    await expect(orcaProtocol.connect(member).finalizeProposal(RULE_PROPOSAL_ID, POD_ID))
      .to.emit(ruleManager, "UpdateRule")
      .withArgs(1, orcaToken.address, balanceOfFuncSig, params, comparisonLogic, comparisonValue);

    // confirm proposal no longer pending
    const voteProposal = await ruleManager.rulesByPod(POD_ID);
    expect(voteProposal.isFinalized).to.equal(true);
    expect(voteProposal.contractAddress).to.equal(orcaToken.address);
    expect(voteProposal.comparisonValue).to.equal(5);
  });

  it("should not claim second membership", async () => {
    await expect(orcaProtocol.connect(owner).claimMembership(1)).to.be.revertedWith("User is already member");
  });

  it("should claim membership with min tokens", async () => {
    await expect(() => orcaToken.connect(member).mint()).to.changeTokenBalance(orcaToken, member, 6);

    await expect(orcaProtocol.connect(member).claimMembership(POD_ID))
      .to.emit(memberToken, "TransferSingle")
      .withArgs(orcaProtocol.address, AddressZero, member.address, 1, 1);

    expect(await memberToken.balanceOf(member.address, 1)).to.equal(1);
  });

  const TYPE_ACTION = 1;
  const ACTION_PROPOSAL_ID = 2;

  it("should create an Action Proposal", async () => {
    const encodedMint = orcaToken.interface.encodeFunctionData("mint");
    await expect(orcaProtocol.connect(owner).createActionProposal(POD_ID, orcaToken.address, 0, encodedMint))
      .to.emit(voteManager, "ProposalCreated")
      .withArgs(ACTION_PROPOSAL_ID, POD_ID, owner.address, TYPE_ACTION, 99);
  });

  it("should cast a vote on an Action proposal", async () => {
    let voteProposal = await voteManager.proposalByPod(POD_ID);
    expect(voteProposal.approvals).to.equal(1);

    await expect(orcaProtocol.connect(member).approve(ACTION_PROPOSAL_ID, POD_ID, member.address))
      .to.emit(voteManager, "ProposalApproved")
      .withArgs(ACTION_PROPOSAL_ID, POD_ID, member.address);

    voteProposal = await voteManager.proposalByPod(POD_ID);
    expect(voteProposal.approvals).to.equal(2);
  });

  it("should finalize action vote and mint more orcaTokens", async () => {
    const initialOrcaTokenSupply = await orcaToken.totalSupply();

    // finalize proposal
    await expect(
      orcaProtocol.connect(member).finalizeProposal(ACTION_PROPOSAL_ID, POD_ID, { gasLimit: "9500000" }),
    ).to.emit(safeTeller, "ActionExecuted");

    const updatedOrcaTokenSupply = await orcaToken.totalSupply();

    await expect(updatedOrcaTokenSupply.sub(initialOrcaTokenSupply)).to.equal(6);
  });

  const TYPE_STRATEGY = 2;
  const STRATEGY_PROPOSAL_ID = 3;
  const STRATEGY_ID = 2;

  it("should create a Strategy Proposal ", async () => {
    await expect(
      orcaProtocol
        .connect(owner)
        .createStrategyProposal(POD_ID, MIN_VOTING_PERIOD + 1, MAX_VOTING_PERIOD, MIN_QUORUM + 1, MAX_QUORUM),
    )
      .to.emit(voteManager, "ProposalCreated")
      .withArgs(STRATEGY_PROPOSAL_ID, POD_ID, owner.address, TYPE_STRATEGY, STRATEGY_ID);
  });

  it("should finalize strategy Proposal", async () => {
    // increment block
    await ethers.provider.send("evm_mine");
    // finalize proposal
    await expect(
      orcaProtocol.connect(member).finalizeProposal(STRATEGY_PROPOSAL_ID, POD_ID, { gasLimit: "9500000" }),
    ).to.emit(voteManager, "VoteStrategyUpdated");

    const strategy = await voteManager.voteStrategiesByPod(POD_ID);
    expect(strategy.minVotingPeriod).to.equal(MIN_VOTING_PERIOD + 1);
    expect(strategy.maxVotingPeriod).to.equal(MAX_VOTING_PERIOD);
    expect(strategy.minQuorum).to.equal(MIN_QUORUM + 1);
    expect(strategy.maxQuorum).to.equal(MAX_QUORUM);
  });

  it("should not revoke a valid membership", async () => {
    await expect(orcaProtocol.connect(owner).retractMembership(1, owner.address)).to.be.revertedWith("Rule Compliant");
  });
});
