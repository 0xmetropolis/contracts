const { expect, use } = require("chai");
const { waffle, ethers } = require("hardhat");

const OrcaProtocol = require("../artifacts/contracts/OrcaProtocol.sol/OrcaProtocol.json");
const PowerToken = require("../artifacts/contracts/PowerBank.sol/PowerToken.json");
const PowerBank = require("../artifacts/contracts/PowerBank.sol/PowerBank.json");
const OrcaToken = require("../artifacts/contracts/OrcaToken.sol/OrcaToken.json");
const VoteManager = require("../artifacts/contracts/VoteManager.sol/VoteManager.json");
const RuleManager = require("../artifacts/contracts/RuleManager.sol/RuleManager.json");
const SafeTeller = require("../artifacts/contracts/SafeTeller.sol/SafeTeller.json");

const GnosisSafeAbi = require("../abis/GnosisSafe.json");

const { deployContract, provider, solidity } = waffle;

use(solidity);

describe("Orca Tests", () => {
  const [admin, host, member, shepherd] = provider.getWallets();

  let orcaProtocol;
  let orcaToken;
  let powerToken;
  let powerBank;
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
  const podId = 1;
  const totalSupply = 10;
  const minVotingPeriod = 1;
  const maxVotingPeriod = 1;
  const minQuorum = 1;
  const maxQuorum = 1;

  before(async () => {
    orcaToken = await deployContract(admin, OrcaToken);

    powerToken = await deployContract(admin, PowerToken);
    powerBank = await deployContract(admin, PowerBank, [powerToken.address]);
    ruleManager = await deployContract(admin, RuleManager);
    voteManager = await deployContract(admin, VoteManager, [admin.address]);
    safeTeller = await deployContract(admin, SafeTeller);

    orcaProtocol = await deployContract(admin, OrcaProtocol, [
      powerBank.address,
      voteManager.address,
      ruleManager.address,
      safeTeller.address,
    ]);

    await powerBank.connect(admin).updateController(orcaProtocol.address);
    await ruleManager.connect(admin).updateController(orcaProtocol.address);
    await voteManager.connect(admin).updateController(orcaProtocol.address);
    await safeTeller.connect(admin).updateController(orcaProtocol.address);
  });

  it("should create a pod", async () => {
    await expect(
      orcaProtocol
        .connect(host)
        .createPod(podId, minVotingPeriod, maxVotingPeriod, minQuorum, maxQuorum, totalSupply, { gasLimit: "9500000" }),
    ).to.emit(safeTeller, "CreateSafe");

    expect(await powerToken.balanceOf(host.address, 1)).to.equal(1);

    // query the new gnosis safe and confirm the voteManager is the only owner
    const safeAddress = await orcaProtocol.safeAddress(podId);
    podSafe = new ethers.Contract(safeAddress, GnosisSafeAbi, admin);
    const podSafeOwners = await podSafe.getOwners();
    expect(podSafeOwners.length).to.be.equal(1);
    expect(podSafeOwners[0]).to.be.equal(safeTeller.address);
  });

  it("should not claim membership without rule", async () => {
    await expect(orcaProtocol.connect(member).claimMembership(podId)).to.be.revertedWith("No rule set");
  });

  const ruleProposalId = 1;

  it("should create a rule proposal to raise membership min tokens", async () => {
    // can only use changeTokenBalance with ERC20/721
    await expect(() => orcaToken.connect(host).mint()).to.changeTokenBalance(orcaToken, host, 6);

    await expect(
      orcaProtocol
        .connect(host)
        .createRuleProposal(podId, orcaToken.address, balanceOfFuncSig, params, comparisonLogic, 5),
    ).to.emit(voteManager, "ProposalCreated");

    const voteProposal = await voteManager.proposalByPod(podId);
    expect(voteProposal.proposalId).to.equal(ruleProposalId);
    expect(voteProposal.approvals).to.equal(1);
  });

  it("should not cast a vote without power", async () => {
    await expect(orcaProtocol.connect(member).approve(ruleProposalId, podId, member.address)).to.be.revertedWith(
      "User lacks power",
    );
  });

  it("should cast a duplicate vote and revert", async () => {
    await expect(orcaProtocol.connect(host).approve(ruleProposalId, podId, host.address)).to.be.revertedWith(
      "This member has already voted",
    );
  });

  it("should finalize rule vote", async () => {
    // increment block
    await ethers.provider.send("evm_mine");
    // finalize proposal
    await expect(orcaProtocol.connect(member).finalizeProposal(ruleProposalId, podId, { gasLimit: "9500000" }))
      .to.emit(ruleManager, "UpdateRule")
      .withArgs(1, orcaToken.address, balanceOfFuncSig, params, comparisonLogic, comparisonValue);

    // confirm proposal no longer pending
    const voteProposal = await ruleManager.rulesByPod(podId);
    expect(voteProposal.isFinalized).to.equal(true);
    expect(voteProposal.contractAddress).to.equal(orcaToken.address);
    expect(voteProposal.comparisonValue).to.equal(5);
  });

  it("should not claim second membership", async () => {
    await expect(orcaProtocol.connect(host).claimMembership(1)).to.be.revertedWith("User is already member");
  });

  it("should claim membership with min tokens", async () => {
    await expect(() => orcaToken.connect(member).mint()).to.changeTokenBalance(orcaToken, member, 6);

    await expect(orcaProtocol.connect(member).claimMembership(podId, { gasLimit: "9500000" }))
      .to.emit(powerToken, "TransferSingle")
      .withArgs(powerBank.address, powerBank.address, member.address, 1, 1);

    expect(await powerToken.balanceOf(member.address, 1)).to.equal(1);
  });

  const actionProposalId = 2;

  it("should create an Action Proposal", async () => {
    const encodedMint = orcaToken.interface.encodeFunctionData("mint");
    await expect(orcaProtocol.connect(host).createActionProposal(podId, orcaToken.address, 0, encodedMint))
      .to.emit(voteManager, "ProposalCreated")
      .withArgs(actionProposalId, podId, host.address, 1, 1);
  });

  it("should cast a vote on an Action proposal", async () => {
    let voteProposal = await voteManager.proposalByPod(podId);
    expect(voteProposal.approvals).to.equal(1);

    await expect(orcaProtocol.connect(member).approve(actionProposalId, podId, member.address))
      .to.emit(voteManager, "ProposalApproved")
      .withArgs(actionProposalId, podId, member.address);

    voteProposal = await voteManager.proposalByPod(podId);
    expect(voteProposal.approvals).to.equal(2);
  });

  it("should finalize action vote and mint more orcaTokens", async () => {
    const initialOrcaTokenSupply = await orcaToken.totalSupply();

    // finalize proposal
    await expect(
      orcaProtocol.connect(member).finalizeProposal(actionProposalId, podId, { gasLimit: "9500000" }),
    ).to.emit(safeTeller, "ActionExecuted");

    const updatedOrcaTokenSupply = await orcaToken.totalSupply();

    await expect(updatedOrcaTokenSupply.sub(initialOrcaTokenSupply)).to.equal(6);
  });

  // TODO: Good luck Steven
  // it("should not revoke a valid membership", async () => {
  //   await expect(powerBank.connect(shephard).retractMembership(1, host.address)).to.be.revertedWith(
  //     "Rule Compliant",
  //   );
  // });
});
