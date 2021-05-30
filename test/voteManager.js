const { expect, use } = require("chai");
const { waffle } = require("hardhat");

const VoteManager = require("../artifacts/contracts/VoteManager.sol/VoteManager.json");

const { deployContract, provider, solidity } = waffle;

let voteManager;

use(solidity);

describe("VoteManager", () => {
  const [, admin, member1, member2] = provider.getWallets();

  const POD_ID = 1;
  const MIN_VOTING_PERIOD = 1 * 60; // 1 minute
  const MAX_VOTING_PERIOD = 60 * 60; // 1 hour
  const MIN_QUORUM = 2;
  const MAX_QUORUM = 3;

  const PROPOSAL_ID = 1; // should generate proposal Id
  const PROPOSAL_TYPE = 1; // 0 == Rule, 1 == Action
  const EXECUTABLE_ID = 1; // id of executable stored in rule/action book

  describe("Happy Path", async () => {
    before(async () => {
      voteManager = await deployContract(admin, VoteManager, [admin.address]);
    });

    it("should create a voting strategy", async () => {
      await expect(
        voteManager
          .connect(admin)
          .createVotingStrategy(POD_ID, MIN_VOTING_PERIOD, MAX_VOTING_PERIOD, MIN_QUORUM, MAX_QUORUM),
      )
        .to.emit(voteManager, "VoteStrategyUpdated")
        .withArgs(POD_ID, MIN_VOTING_PERIOD, MAX_VOTING_PERIOD, MIN_QUORUM, MAX_QUORUM);

      const strategy = await voteManager.voteStrategiesByPod(POD_ID);
      expect(strategy.minVotingPeriod).to.equal(MIN_VOTING_PERIOD);
      expect(strategy.maxVotingPeriod).to.equal(MAX_VOTING_PERIOD);
      expect(strategy.minQuorum).to.equal(MIN_QUORUM);
      expect(strategy.maxQuorum).to.equal(MAX_QUORUM);
    });

    it("should create a new action proposal", async () => {
      await expect(voteManager.connect(admin).createProposal(POD_ID, admin.address, PROPOSAL_TYPE, EXECUTABLE_ID))
        .to.emit(voteManager, "ProposalCreated")
        .withArgs(PROPOSAL_ID, POD_ID, admin.address, PROPOSAL_TYPE, EXECUTABLE_ID);

      const proposal = await voteManager.proposalByPod(POD_ID);
      expect(proposal.proposalId).to.equal(PROPOSAL_ID);
      expect(proposal.proposalType).to.equal(PROPOSAL_TYPE);
      expect(proposal.executableId).to.equal(EXECUTABLE_ID);
      expect(proposal.approvals).to.equal(1);
      expect(proposal.isChallenged).to.equal(false);
      expect(proposal.didPass).to.equal(false);
    });

    it("should approve proposal", async () => {
      await expect(voteManager.connect(admin).approveProposal(POD_ID, PROPOSAL_ID, member1.address))
        .to.emit(voteManager, "ProposalApproved")
        .withArgs(PROPOSAL_ID, POD_ID, member1.address);

      expect(await voteManager.userHasVotedByProposal(PROPOSAL_ID, member1.address)).to.equal(true);

      const proposal = await voteManager.proposalByPod(POD_ID);
      expect(proposal.approvals).to.equal(MIN_QUORUM);
    });

    it("should finalize proposal", async () => {
      // Fast forward to end of voting period
      await provider.send("evm_increaseTime", [MIN_VOTING_PERIOD]);
      await provider.send("evm_mine");

      await expect(voteManager.connect(admin).passProposal(POD_ID, PROPOSAL_ID))
        .to.emit(voteManager, "ProposalPassed")
        .withArgs(POD_ID, PROPOSAL_ID);

      const proposal = await voteManager.proposalByPod(POD_ID);
      expect(proposal.didPass).to.equal(true);
    });
  });

  describe("Edge Cases", async () => {
    beforeEach(async () => {
      // Deploy vote manager
      voteManager = await deployContract(admin, VoteManager, [admin.address]);
      // Create vote strategy
      await voteManager
        .connect(admin)
        .createVotingStrategy(POD_ID, MIN_VOTING_PERIOD, MAX_VOTING_PERIOD, MIN_QUORUM, MAX_QUORUM);
      await voteManager.connect(admin).createProposal(POD_ID, admin.address, PROPOSAL_TYPE, EXECUTABLE_ID);
    });

    it("should fail to finalize proposal early", async () => {
      await expect(voteManager.connect(admin).passProposal(POD_ID, PROPOSAL_ID)).to.revertedWith(
        "Voting Period Still Active",
      );
    });

    it("should not double approve proposal", async () => {
      // Fast forward to end of voting period
      await provider.send("evm_increaseTime", [MIN_VOTING_PERIOD]);
      await provider.send("evm_mine");

      await expect(voteManager.connect(admin).approveProposal(POD_ID, PROPOSAL_ID, admin.address)).to.be.revertedWith(
        "This member has already voted",
      );
    });

    it("should not vote after voting period", async () => {
      // Fast forward to end of voting period
      await provider.send("evm_increaseTime", [MIN_VOTING_PERIOD + 10]);
      await provider.send("evm_mine");

      await expect(voteManager.connect(admin).approveProposal(POD_ID, PROPOSAL_ID, member1.address)).to.be.revertedWith(
        "Voting Period Not Active",
      );
    });

    describe("Proposal Challenge", async () => {
      it("should challenge proposal", async () => {
        await expect(voteManager.connect(admin).challengeProposal(POD_ID, PROPOSAL_ID, member1.address))
          .to.emit(voteManager, "ProposalChallenged")
          .withArgs(PROPOSAL_ID, POD_ID, member1.address);

        const proposal = await voteManager.proposalByPod(POD_ID);
        expect(proposal.isChallenged).to.equal(true);
      });

      it("should pass after challenge", async () => {
        await voteManager.connect(admin).approveProposal(POD_ID, PROPOSAL_ID, member1.address);
        await voteManager.connect(admin).challengeProposal(POD_ID, PROPOSAL_ID, member1.address);
        await voteManager.connect(admin).approveProposal(POD_ID, PROPOSAL_ID, member2.address);
        // check if min quorum is hit
        const proposal = await voteManager.proposalByPod(POD_ID);
        expect(proposal.approvals).to.equal(MAX_QUORUM);
        expect(proposal.isChallenged).to.equal(true);
        // Fast forward to end of min voting period
        await provider.send("evm_increaseTime", [MAX_VOTING_PERIOD + 10]);
        await provider.send("evm_mine");

        await expect(voteManager.connect(admin).passProposal(POD_ID, PROPOSAL_ID))
          .to.emit(voteManager, "ProposalPassed")
          .withArgs(POD_ID, PROPOSAL_ID);
      });

      it("should not challenge after voting period", async () => {
        // Fast forward to end of min voting period
        await provider.send("evm_increaseTime", [MIN_VOTING_PERIOD + 10]);
        await provider.send("evm_mine");

        await expect(
          voteManager.connect(admin).challengeProposal(POD_ID, PROPOSAL_ID, member1.address),
        ).to.revertedWith("Voting Period Not Active");
      });

      it("should not pass after min time", async () => {
        await voteManager.connect(admin).approveProposal(POD_ID, PROPOSAL_ID, member1.address);
        await voteManager.connect(admin).challengeProposal(POD_ID, PROPOSAL_ID, member1.address);
        await voteManager.connect(admin).approveProposal(POD_ID, PROPOSAL_ID, member2.address);
        // check if min quorum is hit
        const proposal = await voteManager.proposalByPod(POD_ID);
        expect(proposal.approvals).to.equal(MAX_QUORUM);

        // Fast forward to end of min voting period
        await provider.send("evm_increaseTime", [MIN_VOTING_PERIOD + 10]);
        await provider.send("evm_mine");

        await expect(voteManager.connect(admin).passProposal(POD_ID, PROPOSAL_ID)).to.revertedWith(
          "Voting Period Still Active",
        );
      });

      it("should not pass with min votes", async () => {
        await voteManager.connect(admin).approveProposal(POD_ID, PROPOSAL_ID, member1.address);
        await voteManager.connect(admin).challengeProposal(POD_ID, PROPOSAL_ID, member1.address);
        // check if min quorum is hit
        const proposal = await voteManager.proposalByPod(POD_ID);
        expect(proposal.approvals).to.equal(MIN_QUORUM);
        expect(proposal.isChallenged).to.equal(true);
        // Fast forward to end of min voting period
        await provider.send("evm_increaseTime", [MAX_VOTING_PERIOD + 10]);
        await provider.send("evm_mine");

        await expect(voteManager.connect(admin).passProposal(POD_ID, PROPOSAL_ID)).to.revertedWith(
          "Quorum Not Reached",
        );
      });
    });
  });
});
