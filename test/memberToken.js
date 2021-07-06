const { expect, use } = require("chai");
const { waffle, ethers } = require("hardhat");

const OrcaProtocol = require("../artifacts/contracts/OrcaProtocol.sol/OrcaProtocol.json");
const MemberToken = require("../artifacts/contracts/MemberToken.sol/MemberToken.json");
const RuleManager = require("../artifacts/contracts/RuleManager.sol/RuleManager.json");
const SafeTeller = require("../artifacts/contracts/SafeTeller.sol/SafeTeller.json");
const OwnerToken = require("../artifacts/contracts/OwnerToken.sol/OwnerToken.json");

const { deployContract, deployMockContract, solidity, provider } = waffle;

const { AddressZero, HashZero } = ethers.constants;

use(solidity);

describe("Member Token Tests", () => {
  const [admin, owner, alice, bob, charlie] = provider.getWallets();

  let orcaProtocol;
  let memberToken;
  let ruleManager;
  let safeTeller;
  let ownerToken;

  // create pod args
  const podId = 1;

  before(async () => {
    ruleManager = await deployMockContract(admin, RuleManager.abi);
    safeTeller = await deployMockContract(admin, SafeTeller.abi);

    memberToken = await deployContract(admin, MemberToken);
    ownerToken = await deployContract(admin, OwnerToken);

    orcaProtocol = await deployContract(admin, OrcaProtocol, [
      memberToken.address,
      ruleManager.address,
      safeTeller.address,
      ownerToken.address,
    ]);

    await memberToken.connect(admin).updateController(orcaProtocol.address);
  });

  it("should not be able to mint to a user", async () => {
    await expect(memberToken.connect(owner).mint(owner.address, podId, HashZero)).to.be.reverted;
  });

  it("should be able to claim a membership", async () => {
    await ruleManager.mock.hasRules.returns(true);
    await ruleManager.mock.isRuleCompliant.returns(true);

    await safeTeller.mock.onMint.returns();

    await expect(orcaProtocol.connect(alice).claimMembership(podId, alice.address)).to.emit(
      memberToken,
      "TransferSingle",
    );
  });

  it("shouldn't claim a second membership", async () => {
    await expect(orcaProtocol.connect(alice).claimMembership(podId, alice.address)).to.be.revertedWith(
      "User is already member",
    );
  });

  it("should be able to transfer membership to a rule compliant user", async () => {
    await ruleManager.mock.hasRules.returns(true);
    await ruleManager.mock.isRuleCompliant.returns(true);

    await safeTeller.mock.onTransfer.returns();

    await expect(memberToken.connect(alice).safeTransferFrom(alice.address, bob.address, podId, 1, HashZero)).to.emit(
      memberToken,
      "TransferSingle",
    );
  });

  it("should not be able to transfer membership to a non compliant user", async () => {
    await ruleManager.mock.hasRules.returns(true);
    await ruleManager.mock.isRuleCompliant.returns(false);

    await expect(
      memberToken.connect(bob).safeTransferFrom(bob.address, charlie.address, podId, 1, HashZero),
    ).to.be.revertedWith("Not Rule Compliant");
  });

  it("shouldn't burn a compliant user", async () => {
    await ruleManager.mock.hasRules.returns(true);
    await ruleManager.mock.isRuleCompliant.returns(true);

    await expect(orcaProtocol.connect(owner).retractMembership(podId, bob.address)).to.be.revertedWith(
      "Rule Compliant",
    );
  });

  it("should burn a non-compliant user", async () => {
    await ruleManager.mock.hasRules.returns(true);
    await ruleManager.mock.isRuleCompliant.returns(false);

    await safeTeller.mock.onBurn.returns();

    await expect(orcaProtocol.connect(owner).retractMembership(podId, bob.address))
      .to.emit(memberToken, "TransferSingle")
      .withArgs(orcaProtocol.address, bob.address, AddressZero, podId, 1);
  });
});
