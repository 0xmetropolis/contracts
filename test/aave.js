const { expect, use } = require("chai");
const { waffle, ethers } = require("hardhat");
const hre = require("hardhat");

const AaveTokenV2Abi = require("../abis/AaveTokenV2.json");
const AaveGovernanceV2Abi = require("../abis/AaveGovernanceV2.json");

const OrcaProtocol = require("../artifacts/contracts/OrcaProtocol.sol/OrcaProtocol.json");
const OrcaToken = require("../artifacts/contracts/OrcaToken.sol/OrcaToken.json");
const OrcaMemberToken = require("../artifacts/contracts/OrcaMemberToken.sol/OrcaMemberToken.json");
const OrcaPodManager = require("../artifacts/contracts/OrcaPodManager.sol/OrcaPodManager.json");
const OrcaVoteManager = require("../artifacts/contracts/OrcaVoteManager.sol/OrcaVoteManager.json");
const OrcaRulebook = require("../artifacts/contracts/OrcaRulebook.sol/OrcaRulebook.json");

const GnosisSafeAbi = require("../abis/GnosisSafe.json");

const { deployContract, provider, solidity } = waffle;

use(solidity);

describe("AAVE Tests", () => {
  const [admin, host, member, shepherd] = provider.getWallets();

  let orcaProtocol;
  let orcaToken;
  let orcaPodManager;
  let orcaVoteManager;
  let orcaRulebook;

  // create pod args
  const podId = 1;
  const totalSupply = 10;
  const votingPeriod = 2;
  const minQuorum = 1;
  const masterGnosisContract = "0x34CfAC646f301356fAa8B21e94227e3583Fe3F5F";

  // vote proposal args
  const getDelegateeFunctionHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("getDelegateeByType(address,uint8)"));
  const getDelegateeFuncSig = ethers.utils.hexDataSlice(getDelegateeFunctionHash, 0, 4);

  const param1 = ethers.utils.formatBytes32String("MEMBER");
  const param2 = ethers.utils.hexZeroPad(1, 32);
  const param3 = ethers.utils.formatBytes32String("");
  const param4 = ethers.utils.formatBytes32String("");
  const param5 = ethers.utils.formatBytes32String("");
  const params = [param1, param2, param3, param4, param5];
  const comparisonLogic = 0;
  let comparisonValue;


  // aave variables
  const aaveWhaleAddress = "0x3744da57184575064838bbc87a0fc791f5e39ea2";
  let aaveWhaleSigner;
  const testAddress = "0x4ffE4F14cec61EDD720aD2855Ff927137b3957e3";
  const aaveToken = new ethers.Contract("0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9", AaveTokenV2Abi, provider);
  const aaveGovernanceAddress = "0xEC568fffba86c094cf06b22134B23074DFE2252c"
  const aaveGovernanceContract = new ethers.Contract(aaveGovernanceAddress, AaveGovernanceV2Abi, provider);


  before("Deploy OrcaProtocol", async () => {
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

    const [ruleEvent] = await orcaProtocol.queryFilter("RulebookAddress");
    orcaRulebook = new ethers.Contract(ruleEvent.args[0], OrcaRulebook.abi, admin);

    // create aave whale account
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [aaveWhaleAddress],
    });
    aaveWhaleSigner = await ethers.provider.getSigner(aaveWhaleAddress);
  });

  it("should create an aave pod for proposition delegation", async () => {
    // TODO: autoIncrement podId
    await expect(
      orcaProtocol.connect(host).createPod(podId, totalSupply, votingPeriod, minQuorum, masterGnosisContract),
    )
      .to.emit(orcaProtocol, "CreatePod")
      .withArgs(1)
      .to.emit(orcaVoteManager, "CreateVoteStrategy")
      .withArgs(1, 2, 1)
      .to.emit(orcaVoteManager, "CreateSafe");

    expect(await orcaMemberToken.balanceOf(host.address, 1)).to.equal(1);

    // query the new gnosis safe and confirm the orcaVoteManager is the only owner
    const safeAddress = await orcaVoteManager.safes(1);
    podSafe = new ethers.Contract(safeAddress, GnosisSafeAbi, admin);
    const podSafeOwners = await podSafe.getOwners();
    await expect(podSafeOwners.length).to.be.equal(1);
    await expect(podSafeOwners[0]).to.be.equal(orcaVoteManager.address);
  });

  // create a new proposal requiring delegation to occur
  it("should create a rule proposal to require members to delegate to the pod's gnosis safe address", async () => {
    comparisonValue = ethers.BigNumber.from(podSafe.address)
    await expect(
      orcaVoteManager
        .connect(host)
        .createRuleProposal(1, aaveToken.address, getDelegateeFuncSig, params, comparisonLogic, comparisonValue),
    )
      .to.emit(orcaVoteManager, "CreateRuleProposal")
      .withArgs(1, 1, host.address);

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

    await expect(orcaVoteManager.connect(host).vote(1, true))
      .to.emit(orcaVoteManager, "CastVote")
      .withArgs(1, 1, host.address, true);

    voteProposal = await orcaVoteManager.voteProposalByPod(1);
    expect(voteProposal.approveVotes).to.equal(1);
    expect(voteProposal.rejectVotes).to.equal(0);
  });

  it("should cast a duplicate vote and revert", async () => {
    await expect(orcaVoteManager.connect(host).vote(1, true)).to.be.revertedWith("This member has already voted");
  });

  it("should fail to finalize vote due to voting period", async () => {
    await expect(orcaVoteManager.connect(host).finalizeRuleVote(1, { gasLimit: "9500000" })).to.be.revertedWith(
      "The voting period has not ended",
    );
  });

  it("should finalize rule vote", async () => {
    // finalize proposal
    await expect(orcaVoteManager.connect(host).finalizeRuleVote(1, { gasLimit: "9500000" }))
      .to.emit(orcaVoteManager, "FinalizeProposal")
      .withArgs(1, 1, host.address, true)
      .to.emit(orcaRulebook, "UpdateRule")
      .withArgs(1, aaveToken.address, getDelegateeFuncSig, params, comparisonLogic, comparisonValue);


    //confirm proposal no longer pending
    const voteProposal = await orcaRulebook.rulesByPod(1);
    expect(voteProposal.isFinalized).to.equal(true);
    expect(voteProposal.contractAddress).to.equal(aaveToken.address);
    expect(voteProposal.comparisonValue).to.equal(comparisonValue);
  });


  it("should fail to claim membership without delegating", async () => {
    await expect(orcaPodManager.connect(aaveWhaleSigner).claimMembership(1, { gasLimit: "9500000" })).to.be.revertedWith("Not Rule Compliant");
  });

  it("delegate aave whale proposition to pod save and claim membership again", async () => {
    expect(aaveToken.connect(aaveWhaleSigner).delegateByType(podSafe.address, 1));
    const delegate = await aaveToken.getDelegateeByType(aaveWhaleAddress, 1);
    expect(delegate).to.be.equal(podSafe.address);

    await expect(orcaPodManager.connect(aaveWhaleSigner).claimMembership(1, { gasLimit: "9500000" }))
      .to.emit(orcaMemberToken, "TransferSingle");
  });

  it("should create an Action Proposal", async () => {
    // data stolen from transaction 0x5ffa52e14c76d76cb1295b44cb3cb3028542913153ec28952b85aabe5784d64c
    const encodedCreate = "0xf8741a9c000000000000000000000000ee56e2b3d491590b5b31738cc34d5232f378a8d500000000000000000000000000000000000000000000000000000000000000e00000000000000000000000000000000000000000000000000000000000000120000000000000000000000000000000000000000000000000000000000000016000000000000000000000000000000000000000000000000000000000000001c00000000000000000000000000000000000000000000000000000000000000240384dd57abcd23aae459877625228062db4082485a0ac1fc45eb54524f58365070000000000000000000000000000000000000000000000000000000000000001000000000000000000000000d08e12367a7d68caa8ff080d3a56b2dc6650709b00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000004614619540000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000001"
    await expect(orcaVoteManager.connect(host).createActionProposal(1, aaveGovernanceAddress, 0, encodedCreate))
      .to.emit(orcaVoteManager, "CreateActionProposal")
      .withArgs(2, 1, host.address, aaveGovernanceAddress, 0, encodedCreate);
  });

  it("should cast a vote on an Action proposal", async () => {
    let voteProposal = await orcaVoteManager.voteProposalByPod(1);
    expect(voteProposal.approveVotes).to.equal(0);
    expect(voteProposal.rejectVotes).to.equal(0);

    await expect(orcaVoteManager.connect(host).vote(1, true))
      .to.emit(orcaVoteManager, "CastVote")
      .withArgs(1, 2, host.address, true);

    voteProposal = await orcaVoteManager.voteProposalByPod(1);
    expect(voteProposal.approveVotes).to.equal(1);
    expect(voteProposal.rejectVotes).to.equal(0);
  });

  it("should fail to finalize vote due to voting period", async () => {
    await expect(orcaVoteManager.connect(host).finalizeActionVote(1, { gasLimit: "9500000" })).to.be.revertedWith(
      "The voting period has not ended",
    );
  });

  it("should finalize action vote and create proposal", async () => {
    const initialOrcaTokenSupply = await orcaToken.totalSupply();

    // finalize proposal
    await expect(orcaVoteManager.connect(host).finalizeActionVote(1, { gasLimit: "9500000" }))
      .to.emit(orcaVoteManager, "FinalizeProposal")
      .withArgs(1, 2, host.address, true)
      .to.emit(aaveGovernanceContract, "ProposalCreated")
      .to.emit(podSafe, "ExecutionSuccess");
  });
});
