const { expect, use } = require("chai");
const { waffle, ethers, network } = require("hardhat");

const OrcaProtocol = require("../artifacts/contracts/OrcaProtocol.sol/OrcaProtocol.json");
const MemberToken = require("../artifacts/contracts/MemberToken.sol/MemberToken.json");
const OrcaToken = require("../artifacts/contracts/OrcaToken.sol/OrcaToken.json");
const VoteManager = require("../artifacts/contracts/VoteManager.sol/VoteManager.json");
const RuleManager = require("../artifacts/contracts/RuleManager.sol/RuleManager.json");
const SafeTeller = require("../artifacts/contracts/SafeTeller.sol/SafeTeller.json");
const OwnerToken = require("../artifacts/contracts/OwnerToken.sol/OwnerToken.json");

const GnosisSafeAbi = require("../abis/GnosisSafe.json");

const { deployContract, provider, solidity } = waffle;

const { AddressZero } = ethers.constants;

use(solidity);

describe("Orca Tests", () => {
  const [admin, owner, member, member2] = provider.getWallets();

  let orcaProtocol;
  let orcaToken;
  let memberToken;
  let voteManager;
  let ruleManager;
  let safeTeller;
  let podSafe;
  let ownerToken;

  before(async () => {
    // setup mainnet fork
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_TOKEN}`,
            blockNumber: 11095000,
          },
        },
      ],
    });
  });

  beforeEach(async () => {
    orcaToken = await deployContract(admin, OrcaToken);
    memberToken = await deployContract(admin, MemberToken);
    ruleManager = await deployContract(admin, RuleManager);
    voteManager = await deployContract(admin, VoteManager, [admin.address]);
    safeTeller = await deployContract(admin, SafeTeller);
    ownerToken = await deployContract(admin, OwnerToken);

    orcaProtocol = await deployContract(admin, OrcaProtocol, [
      memberToken.address,
      voteManager.address,
      ruleManager.address,
      safeTeller.address,
      ownerToken.address,
    ]);

    await memberToken.connect(admin).updateController(orcaProtocol.address);
    await ruleManager.connect(admin).updateController(orcaProtocol.address);
    await voteManager.connect(admin).updateController(orcaProtocol.address);
    await safeTeller.connect(admin).updateController(orcaProtocol.address);
  });

  describe("Pod Creation", () => {
    // create pod args
    const POD_ID = 1;
    const MIN_VOTING_PERIOD = 1;
    const MAX_VOTING_PERIOD = 1;
    const MIN_QUORUM = 2;
    const MAX_QUORUM = 2;

    it("should create a pod", async () => {
      // create pod
      await expect(
        orcaProtocol
          .connect(owner)
          .createPod(owner.address, POD_ID, MIN_VOTING_PERIOD, MAX_VOTING_PERIOD, MIN_QUORUM, MAX_QUORUM),
      ).to.emit(safeTeller, "CreateSafe");

      // should mint owner token
      expect(await ownerToken.balanceOf(owner.address)).to.equal(1);

      // query the new gnosis safe
      const safeAddress = await orcaProtocol.safeAddress(POD_ID);
      podSafe = new ethers.Contract(safeAddress, GnosisSafeAbi, admin);

      // confirm the safeteller is the only owner
      const podSafeOwners = await podSafe.getOwners();
      expect(podSafeOwners.length).to.equal(1);
      expect(podSafeOwners[0]).to.equal(safeTeller.address);
    });

    it("should not claim membership without rule", async () => {
      // create pod
      await orcaProtocol
        .connect(owner)
        .createPod(owner.address, POD_ID, MIN_VOTING_PERIOD, MAX_VOTING_PERIOD, MIN_QUORUM, MAX_QUORUM);

      await expect(orcaProtocol.connect(member).claimMembership(POD_ID)).to.be.revertedWith("No rule set");
    });
  });

  describe("Owner Setting Up Pod Rules", async () => {
    // pod args
    const POD_ID = 1;
    const MIN_VOTING_PERIOD = 1;
    const MAX_VOTING_PERIOD = 1;
    const MIN_QUORUM = 2;
    const MAX_QUORUM = 2;

    // rule data (balanceOf token equal to 5)
    const BALANCE_OF_FUNC_HASH = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("balanceOf(address)"));
    const BALANCE_OF_FUNC_SIG = ethers.utils.hexDataSlice(BALANCE_OF_FUNC_HASH, 0, 4);
    const PARAMS = [
      ethers.utils.formatBytes32String("MEMBER"),
      ethers.utils.formatBytes32String(""),
      ethers.utils.formatBytes32String(""),
      ethers.utils.formatBytes32String(""),
      ethers.utils.formatBytes32String(""),
    ];

    // rule comparison logic:
    // 0: equal, 1: greaterThan, 2: lessThan
    const COMPARISON_LOGIC = 1;
    const COMPARISON_VALUE = 5;

    beforeEach(async () => {
      // create pod
      await orcaProtocol
        .connect(owner)
        .createPod(owner.address, POD_ID, MIN_VOTING_PERIOD, MAX_VOTING_PERIOD, MIN_QUORUM, MAX_QUORUM);
    });

    it("should let owner create a pod rule", async () => {
      // create rule
      await expect(
        orcaProtocol
          .connect(owner)
          .createRule(POD_ID, orcaToken.address, BALANCE_OF_FUNC_SIG, PARAMS, COMPARISON_LOGIC, COMPARISON_VALUE),
      ).to.emit(ruleManager, "UpdateRule");
      // confirm rule no longer pending
      const rule = await ruleManager.rulesByPod(POD_ID);
      expect(rule.isFinalized).to.equal(true);
      expect(rule.contractAddress).to.equal(orcaToken.address);
      expect(rule.comparisonValue).to.equal(COMPARISON_VALUE);
    });

    it("should not let a non-owner create a pod rule", async () => {
      // create rule
      await expect(
        orcaProtocol
          .connect(member)
          .createRule(POD_ID, orcaToken.address, BALANCE_OF_FUNC_SIG, PARAMS, COMPARISON_LOGIC, COMPARISON_VALUE),
      ).to.be.revertedWith("User is not owner");
    });

    it("should let a rule compliant user claim membership", async () => {
      const EXPECTED_MEMBER_BALANCE = 1;
      // create rule
      await orcaProtocol
        .connect(owner)
        .createRule(POD_ID, orcaToken.address, BALANCE_OF_FUNC_SIG, PARAMS, COMPARISON_LOGIC, COMPARISON_VALUE);
      // mint tokens
      await orcaToken.connect(member).mint();
      // claim membership
      await expect(orcaProtocol.connect(member).claimMembership(POD_ID))
        .to.emit(memberToken, "TransferSingle")
        .withArgs(orcaProtocol.address, AddressZero, member.address, POD_ID, EXPECTED_MEMBER_BALANCE);

      expect(await memberToken.balanceOf(member.address, POD_ID)).to.equal(EXPECTED_MEMBER_BALANCE);
    });

    it("should not revoke a valid membership", async () => {
      await orcaProtocol
        .connect(owner)
        .createRule(POD_ID, orcaToken.address, BALANCE_OF_FUNC_SIG, PARAMS, COMPARISON_LOGIC, COMPARISON_VALUE);
      // mint tokens
      await orcaToken.connect(member).mint();
      // claim membership
      await orcaProtocol.connect(member).claimMembership(POD_ID);

      await expect(orcaProtocol.connect(member).retractMembership(1, member.address)).to.be.revertedWith(
        "Rule Compliant",
      );
    });

    it("should not let a rule compliant member claim second membership", async () => {
      await orcaProtocol
        .connect(owner)
        .createRule(POD_ID, orcaToken.address, BALANCE_OF_FUNC_SIG, PARAMS, COMPARISON_LOGIC, COMPARISON_VALUE);
      // mint tokens
      await orcaToken.connect(member).mint();
      // claim membership
      await orcaProtocol.connect(member).claimMembership(POD_ID);

      await expect(orcaProtocol.connect(member).claimMembership(POD_ID)).to.be.revertedWith("User is already member");
    });

    it("should not claim membership without min tokens", async () => {
      await orcaProtocol
        .connect(owner)
        .createRule(POD_ID, orcaToken.address, BALANCE_OF_FUNC_SIG, PARAMS, COMPARISON_LOGIC, COMPARISON_VALUE);

      await expect(orcaProtocol.connect(member).claimMembership(POD_ID)).to.be.revertedWith("Not Rule Compliant");
    });
  });

  describe("Members Performing Pod Action", () => {
    // create pod args
    const POD_ID = 1;
    const MIN_VOTING_PERIOD = 2;
    const MAX_VOTING_PERIOD = 1;
    const MIN_QUORUM = 2;
    const MAX_QUORUM = 2;

    // rule data (balanceOf token equal to 5)
    const BALANCE_OF_FUNC_HASH = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("balanceOf(address)"));
    const BALANCE_OF_FUNC_SIG = ethers.utils.hexDataSlice(BALANCE_OF_FUNC_HASH, 0, 4);
    const PARAMS = [
      ethers.utils.formatBytes32String("MEMBER"),
      ethers.utils.formatBytes32String(""),
      ethers.utils.formatBytes32String(""),
      ethers.utils.formatBytes32String(""),
      ethers.utils.formatBytes32String(""),
    ];

    // rule comparison logic:
    // 0: equal, 1: greaterThan, 2: lessThan
    const COMPARISON_LOGIC = 1;
    const COMPARISON_VALUE = 5;

    beforeEach(async () => {
      // create pod
      await orcaProtocol
        .connect(owner)
        .createPod(owner.address, POD_ID, MIN_VOTING_PERIOD, MAX_VOTING_PERIOD, MIN_QUORUM, MAX_QUORUM);
      // create rule
      await orcaProtocol
        .connect(owner)
        .createRule(POD_ID, orcaToken.address, BALANCE_OF_FUNC_SIG, PARAMS, COMPARISON_LOGIC, COMPARISON_VALUE);
      // mint tokens
      await orcaToken.connect(member).mint();
      // claim membership
      await orcaProtocol.connect(member).claimMembership(POD_ID);
      // add second member
      await orcaToken.connect(member2).mint();
      await orcaProtocol.connect(member2).claimMembership(POD_ID);
    });

    // action data
    // const TYPE_ACTION = 1;
    const ACTION_PROPOSAL_ID = 1;
    const VALUE = 0;
    const ENCODED_MINT = new ethers.utils.Interface(OrcaToken.abi).encodeFunctionData("mint");

    it("should create an Action Proposal", async () => {
      // create action proposal
      await expect(orcaProtocol.connect(member).createActionProposal(POD_ID, orcaToken.address, VALUE, ENCODED_MINT))
        .to.emit(safeTeller, "UpdateAction")
        .withArgs(POD_ID, orcaToken.address, VALUE, ENCODED_MINT);

      // should automatically vote on current proposal
      const voteProposal = await voteManager.proposalByPod(POD_ID);
      expect(voteProposal.approvals).to.equal(1);

      // lookup pending action
      const action = await safeTeller.actionProposalByPod(POD_ID);
      expect(action.to).to.equal(orcaToken.address);
      expect(action.value).to.equal(VALUE);
      expect(action.data).to.equal(ENCODED_MINT);
    });

    it("should not let owner create an Action Proposal", async () => {
      // create action proposal
      await expect(
        orcaProtocol.connect(owner).createActionProposal(POD_ID, orcaToken.address, VALUE, ENCODED_MINT),
      ).to.be.revertedWith("User lacks power");
    });

    it("should challenge an Action proposal", async () => {
      // create action proposal
      await orcaProtocol.connect(member).createActionProposal(POD_ID, orcaToken.address, VALUE, ENCODED_MINT);
      // challenge proposal
      await orcaProtocol.connect(member2).challenge(ACTION_PROPOSAL_ID, POD_ID, member2.address);

      const voteProposal = await voteManager.proposalByPod(POD_ID);
      expect(voteProposal.isChallenged).to.equal(true);
    });

    it("should cast a vote on an Action proposal", async () => {
      // create action proposal
      await orcaProtocol.connect(member).createActionProposal(POD_ID, orcaToken.address, VALUE, ENCODED_MINT);

      await expect(orcaProtocol.connect(member2).approve(ACTION_PROPOSAL_ID, POD_ID, member2.address))
        .to.emit(voteManager, "ProposalApproved")
        .withArgs(ACTION_PROPOSAL_ID, POD_ID, member2.address);

      const voteProposal = await voteManager.proposalByPod(POD_ID);
      expect(voteProposal.approvals).to.equal(2);
    });

    it("should finalize action vote and mint more orcaTokens", async () => {
      const EXPECTED_SUPPLY_DELTA = 6;
      const initialOrcaTokenSupply = await orcaToken.totalSupply();

      // create action proposal
      await orcaProtocol.connect(member).createActionProposal(POD_ID, orcaToken.address, VALUE, ENCODED_MINT);
      await orcaProtocol.connect(member2).approve(ACTION_PROPOSAL_ID, POD_ID, member2.address);

      // finalize proposal
      await expect(
        orcaProtocol.connect(member).finalizeProposal(ACTION_PROPOSAL_ID, POD_ID, { gasLimit: "9500000" }),
      ).to.emit(safeTeller, "ActionExecuted");

      const updatedOrcaTokenSupply = await orcaToken.totalSupply();

      await expect(updatedOrcaTokenSupply.sub(initialOrcaTokenSupply)).to.equal(EXPECTED_SUPPLY_DELTA);
    });
  });

  describe("Updating Strategy", () => {
    // create pod args
    const POD_ID = 1;
    const MIN_VOTING_PERIOD = 2;
    const MAX_VOTING_PERIOD = 1;
    const MIN_QUORUM = 2;
    const MAX_QUORUM = 2;

    // rule data (balanceOf token equal to 5)
    const BALANCE_OF_FUNC_HASH = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("balanceOf(address)"));
    const BALANCE_OF_FUNC_SIG = ethers.utils.hexDataSlice(BALANCE_OF_FUNC_HASH, 0, 4);
    const PARAMS = [
      ethers.utils.formatBytes32String("MEMBER"),
      ethers.utils.formatBytes32String(""),
      ethers.utils.formatBytes32String(""),
      ethers.utils.formatBytes32String(""),
      ethers.utils.formatBytes32String(""),
    ];

    // rule comparison logic:
    // 0: equal, 1: greaterThan, 2: lessThan
    const COMPARISON_LOGIC = 1;
    const COMPARISON_VALUE = 5;

    beforeEach(async () => {
      // create pod
      await orcaProtocol
        .connect(owner)
        .createPod(owner.address, POD_ID, MIN_VOTING_PERIOD, MAX_VOTING_PERIOD, MIN_QUORUM, MAX_QUORUM);
      // create rule
      await orcaProtocol
        .connect(owner)
        .createRule(POD_ID, orcaToken.address, BALANCE_OF_FUNC_SIG, PARAMS, COMPARISON_LOGIC, COMPARISON_VALUE);
      // mint tokens
      await orcaToken.connect(member).mint();
      // claim membership
      await orcaProtocol.connect(member).claimMembership(POD_ID);
      // add second member
      await orcaToken.connect(member2).mint();
      await orcaProtocol.connect(member2).claimMembership(POD_ID);
    });

    const STRATEGY_PROPOSAL_ID = 2;
    const STRATEGY_ID = 2;

    it("should let owner create a Strategy", async () => {
      await expect(
        orcaProtocol
          .connect(owner)
          .createStrategy(POD_ID, MIN_VOTING_PERIOD + 1, MAX_VOTING_PERIOD, MIN_QUORUM + 1, MAX_QUORUM),
      )
        .to.emit(voteManager, "VoteStrategyUpdated")
        .withArgs(POD_ID, MIN_VOTING_PERIOD + 1, MAX_VOTING_PERIOD, MIN_QUORUM + 1, MAX_QUORUM);

      const strategy = await voteManager.voteStrategiesByPod(POD_ID);
      expect(strategy.minVotingPeriod).to.equal(MIN_VOTING_PERIOD + 1);
      expect(strategy.maxVotingPeriod).to.equal(MAX_VOTING_PERIOD);
      expect(strategy.minQuorum).to.equal(MIN_QUORUM + 1);
      expect(strategy.maxQuorum).to.equal(MAX_QUORUM);
    });

    it("should create a Strategy Proposal", async () => {
      await expect(
        orcaProtocol
          .connect(member)
          .createStrategyProposal(POD_ID, MIN_VOTING_PERIOD + 1, MAX_VOTING_PERIOD, MIN_QUORUM + 1, MAX_QUORUM),
      )
        .to.emit(voteManager, "VoteStrategyCreated")
        .withArgs(STRATEGY_ID, MIN_VOTING_PERIOD + 1, MAX_VOTING_PERIOD, MIN_QUORUM + 1, MAX_QUORUM);
    });

    it("should finalize strategy Proposal", async () => {
      // create proposal
      await orcaProtocol
        .connect(member)
        .createStrategyProposal(POD_ID, MIN_VOTING_PERIOD + 1, MAX_VOTING_PERIOD, MIN_QUORUM + 1, MAX_QUORUM);
      await orcaProtocol.connect(member2).approve(STRATEGY_PROPOSAL_ID, POD_ID, member2.address);
      // finalize proposal
      await expect(orcaProtocol.connect(member).finalizeProposal(STRATEGY_PROPOSAL_ID, POD_ID)).to.emit(
        voteManager,
        "VoteStrategyUpdated",
      );

      const strategy = await voteManager.voteStrategiesByPod(POD_ID);
      expect(strategy.minVotingPeriod).to.equal(MIN_VOTING_PERIOD + 1);
      expect(strategy.maxVotingPeriod).to.equal(MAX_VOTING_PERIOD);
      expect(strategy.minQuorum).to.equal(MIN_QUORUM + 1);
      expect(strategy.maxQuorum).to.equal(MAX_QUORUM);
    });
  });
});
