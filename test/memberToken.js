const { expect, use } = require("chai");
const { waffle, ethers } = require("hardhat");

const OrcaProtocol = require("../artifacts/contracts/OrcaProtocol.sol/OrcaProtocol.json");
const MemberToken = require("../artifacts/contracts/MemberToken.sol/MemberToken.json");
const VoteManager = require("../artifacts/contracts/VoteManager.sol/VoteManager.json");
const RuleManager = require("../artifacts/contracts/RuleManager.sol/RuleManager.json");
const SafeTeller = require("../artifacts/contracts/SafeTeller.sol/SafeTeller.json");

const { deployContract, deployMockContract, solidity, provider } = waffle;

const { AddressZero, HashZero } = ethers.constants;

use(solidity);

describe("Member Token Tests", () => {
  const [admin, owner, alice, bob, charlie] = provider.getWallets();

  let orcaProtocol;
  let memberToken;
  let voteManager;
  let ruleManager;
  let safeTeller;

  // create pod args
  const podId = 1;
  const minVotingPeriod = 1;
  const maxVotingPeriod = 1;
  const minQuorum = 1;
  const maxQuorum = 1;

  before(async () => {
    ruleManager = await deployMockContract(admin, RuleManager.abi);
    voteManager = await deployMockContract(admin, VoteManager.abi);
    safeTeller = await deployMockContract(admin, SafeTeller.abi);

    memberToken = await deployContract(admin, MemberToken);

    orcaProtocol = await deployContract(admin, OrcaProtocol, [
      memberToken.address,
      voteManager.address,
      ruleManager.address,
      safeTeller.address,
    ]);

    await memberToken.connect(admin).updateController(orcaProtocol.address);
  });

  it("should mint a membership on pod creation", async () => {
    await safeTeller.mock.createSafe.returns(AddressZero);
    await voteManager.mock.createVotingStrategy.returns(1);
    await voteManager.mock.finalizeVotingStrategy.returns(true);

    await expect(
      orcaProtocol
        .connect(owner)
        .createPod(owner.address, podId, minVotingPeriod, maxVotingPeriod, minQuorum, maxQuorum),
    ).to.emit(memberToken, "TransferSingle");

    expect(await memberToken.balanceOf(owner.address, 1)).to.equal(1);
  });

  it("should not be able to mint to a user", async () => {
    await expect(memberToken.connect(owner).mint(owner.address, podId, HashZero)).to.be.reverted;
  });

  it("should be able to claim a membership", async () => {
    await ruleManager.mock.isRuleCompliant.returns(true);

    await expect(orcaProtocol.connect(alice).claimMembership(podId)).to.emit(memberToken, "TransferSingle");
  });

  it("shouldn't claim a second membership", async () => {
    await ruleManager.mock.isRuleCompliant.returns(true);

    await expect(orcaProtocol.connect(alice).claimMembership(podId)).to.be.revertedWith("User is already member");
  });

  it("should be able to transfer membership to a rule compliant user", async () => {
    await ruleManager.mock.isRuleCompliant.returns(true);
    await expect(memberToken.connect(alice).safeTransferFrom(alice.address, bob.address, podId, 1, HashZero)).to.emit(
      memberToken,
      "TransferSingle",
    );
  });

  it("should not be able to transfer membership to a non compliant user", async () => {
    await ruleManager.mock.isRuleCompliant.returns(false);
    await expect(
      memberToken.connect(bob).safeTransferFrom(bob.address, charlie.address, podId, 1, HashZero),
    ).to.be.revertedWith("Not Rule Compliant");
  });

  it("shouldn't burn a compliant user", async () => {
    await ruleManager.mock.isRuleCompliant.returns(true);

    await expect(orcaProtocol.connect(owner).retractMembership(podId, bob.address)).to.be.revertedWith(
      "Rule Compliant",
    );
  });

  it("should burn a non-compliant user", async () => {
    await ruleManager.mock.isRuleCompliant.returns(false);

    await expect(orcaProtocol.connect(owner).retractMembership(podId, bob.address))
      .to.emit(memberToken, "TransferSingle")
      .withArgs(orcaProtocol.address, bob.address, AddressZero, podId, 1);
  });
});
