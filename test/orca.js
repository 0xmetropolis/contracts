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

  it("should deploy contracts", async () => {
    orcaToken = await deployContract(admin, OrcaToken);

    powerToken = await deployContract(admin, PowerToken);
    powerBank = await deployContract(admin, PowerBank, [powerToken.address]);
    ruleManager = await deployContract(admin, RuleManager);
    voteManager = await deployContract(admin, VoteManager);
    safeTeller = await deployContract(admin, SafeTeller);

    orcaProtocol = await deployContract(admin, OrcaProtocol, [
      powerBank.address,
      voteManager.address,
      ruleManager.address,
      safeTeller.address,
    ]);
  });

  it("should create a pod", async () => {
    await expect(
      orcaProtocol.connect(host).createPod(podId, totalSupply, votingPeriod, minQuorum, { gasLimit: "9500000" }),
    )
      .to.emit(orcaProtocol, "CreatePod")
      .withArgs(1)
      .to.emit(voteManager, "CreateVoteStrategy")
      .withArgs(1, 2, 1)
      .to.emit(safeTeller, "CreateSafe");

    expect(await powerToken.balanceOf(host.address, 1)).to.equal(1);

    // query the new gnosis safe and confirm the voteManager is the only owner
    const safeAddress = await orcaProtocol.safeAddress(1);
    podSafe = new ethers.Contract(safeAddress, GnosisSafeAbi, admin);
    const podSafeOwners = await podSafe.getOwners();
    expect(podSafeOwners.length).to.be.equal(1);
    expect(podSafeOwners[0]).to.be.equal(safeTeller.address);
  });

  it("should not claim membership without rule", async () => {
    await expect(orcaProtocol.connect(member).claimMembership(1)).to.be.revertedWith("No rule set");
  });

  it("should create a rule proposal to raise membership min tokens", async () => {
    // can only use changeTokenBalance with ERC20/721
    await expect(() => orcaToken.connect(host).mint()).to.changeTokenBalance(orcaToken, host, 6);

    await expect(
      orcaProtocol.connect(host).createRuleProposal(1, orcaToken.address, balanceOfFuncSig, params, comparisonLogic, 5),
    )
      .to.emit(voteManager, "CreateProposal")
      .withArgs(1, 1, host.address, 0, 1);

    const voteProposal = await voteManager.proposalByPod(1);
    expect(voteProposal.proposalId).to.equal(1);
    expect(voteProposal.approveVotes).to.equal(0);
    expect(voteProposal.rejectVotes).to.equal(0);
    expect(voteProposal.isOpen).to.equal(true);
  });

  it("should cast a vote on a proposal", async () => {
    let voteProposal = await voteManager.proposalByPod(1);
    expect(voteProposal.approveVotes).to.equal(0);
    expect(voteProposal.rejectVotes).to.equal(0);

    await expect(voteManager.connect(host).vote(1, true))
      .to.emit(voteManager, "CastVote")
      .withArgs(1, 1, host.address, true);

    voteProposal = await voteManager.proposalByPod(1);
    expect(voteProposal.approveVotes).to.equal(1);
    expect(voteProposal.rejectVotes).to.equal(0);
  });

  it("should cast a duplicate vote and revert", async () => {
    await expect(voteManager.connect(host).vote(1, true)).to.be.revertedWith("This member has already voted");
  });

  it("should fail to finalize vote due to voting period", async () => {
    await expect(voteManager.connect(host).finalizeProposal(1, { gasLimit: "9500000" })).to.be.revertedWith(
      "The voting period has not ended",
    );
  });

  it("should finalize rule vote", async () => {
    // finalize proposal
    await expect(orcaProtocol.connect(member).finalizeProposal(1, { gasLimit: "9500000" }))
      .to.emit(voteManager, "FinalizeProposal")
      .withArgs(1, 1, true)
      .to.emit(ruleManager, "UpdateRule")
      .withArgs(1, orcaToken.address, balanceOfFuncSig, params, comparisonLogic, comparisonValue);

    // confirm proposal no longer pending
    const voteProposal = await ruleManager.rulesByPod(1);
    expect(voteProposal.isFinalized).to.equal(true);
    expect(voteProposal.contractAddress).to.equal(orcaToken.address);
    expect(voteProposal.comparisonValue).to.equal(5);

    // add reward
  });

  it("should not claim second membership", async () => {
    await expect(orcaProtocol.connect(host).claimMembership(1)).to.be.revertedWith("User is already member");
  });

  it("should claim membership with min tokens", async () => {
    await expect(() => orcaToken.connect(member).mint()).to.changeTokenBalance(orcaToken, member, 6);

    await expect(orcaProtocol.connect(member).claimMembership(1, { gasLimit: "9500000" }))
      .to.emit(powerToken, "TransferSingle")
      .withArgs(powerBank.address, powerBank.address, member.address, 1, 1);

    expect(await powerToken.balanceOf(member.address, 1)).to.equal(1);
  });

  it("should create an Action Proposal", async () => {
    const encodedMint = orcaToken.interface.encodeFunctionData("mint");
    await expect(orcaProtocol.connect(host).createActionProposal(1, orcaToken.address, 0, encodedMint))
      .to.emit(voteManager, "CreateProposal")
      .withArgs(2, 1, host.address, 1, 1)
      .to.emit(safeTeller, "UpdateAction")
      .withArgs(1, orcaToken.address, 0, encodedMint);
  });

  it("should cast a vote on an Action proposal", async () => {
    let voteProposal = await voteManager.proposalByPod(1);
    expect(voteProposal.approveVotes).to.equal(0);
    expect(voteProposal.rejectVotes).to.equal(0);

    await expect(voteManager.connect(host).vote(1, true))
      .to.emit(voteManager, "CastVote")
      .withArgs(1, 2, host.address, true);

    voteProposal = await voteManager.proposalByPod(1);
    expect(voteProposal.approveVotes).to.equal(1);
    expect(voteProposal.rejectVotes).to.equal(0);
  });

  it("should fail to finalize vote due to voting period", async () => {
    await expect(orcaProtocol.connect(host).finalizeProposal(1, { gasLimit: "9500000" })).to.be.revertedWith(
      "The voting period has not ended",
    );
  });

  it("should finalize action vote and mint more orcaTokens", async () => {
    const initialOrcaTokenSupply = await orcaToken.totalSupply();

    // finalize proposal
    await expect(orcaProtocol.connect(member).finalizeProposal(1, { gasLimit: "9500000" }))
      .to.emit(voteManager, "FinalizeProposal")
      .withArgs(1, 2, true)
      .to.emit(safeTeller, "ActionExecuted");

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
