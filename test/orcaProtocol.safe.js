const { expect, use } = require("chai");
const { waffle, ethers } = require("hardhat");

const EthersSafe = require("@gnosis.pm/safe-core-sdk").default;

const GnosisSafe = require("@gnosis.pm/safe-contracts/build/artifacts/contracts/GnosisSafe.sol/GnosisSafe.json");
const GnosisSafeProxyFactory = require("@gnosis.pm/safe-contracts/build/artifacts/contracts/proxies/GnosisSafeProxyFactory.sol/GnosisSafeProxyFactory.json");
const MultiSend = require("@gnosis.pm/safe-contracts/build/artifacts/contracts/libraries/MultiSend.sol/MultiSend.json");

const OrcaProtocol = require("../artifacts/contracts/OrcaProtocol.sol/OrcaProtocol.json");
const MemberToken = require("../artifacts/contracts/MemberToken.sol/MemberToken.json");
const RuleManager = require("../artifacts/contracts/RuleManager.sol/RuleManager.json");
const SafeTeller = require("../artifacts/contracts/SafeTeller.sol/SafeTeller.json");
const OwnerToken = require("../artifacts/contracts/OwnerToken.sol/OwnerToken.json");

const { deployContract, deployMockContract, provider, solidity } = waffle;

use(solidity);

describe("OrcaProtocol safe integration test", () => {
  const [admin, owner, alice, bob, charlie] = provider.getWallets();

  let multiSend;
  let orcaProtocol;

  const TX_OPTIONS = { gasLimit: 4000000 };

  const THRESHOLD = 2;
  const MEMBERS = [alice.address, bob.address];
  const POD_ID = 1;

  const createSafeSigner = async (safe, signer) => {
    const { chainId } = await provider.getNetwork();
    return EthersSafe.create({
      ethers,
      safeAddress: safe.address,
      providerOrSigner: signer,
      contractNetworks: {
        [chainId]: {
          multiSendAddress: multiSend.address,
        },
      },
    });
  };

  const createPodSafe = async () => {
    await orcaProtocol.connect(owner).createPod(POD_ID, MEMBERS, THRESHOLD, owner.address, TX_OPTIONS);
    // query the new gnosis safe
    const safeAddress = await orcaProtocol.safeAddress(POD_ID);
    return new ethers.Contract(safeAddress, GnosisSafe.abi, owner);
  };

  const setup = async () => {
    // Deploy the master safe contract and multisend
    multiSend = await deployContract(admin, MultiSend);
    const gnosisSafeMaster = await deployContract(admin, GnosisSafe);
    const gnosisSafeProxyFactory = await deployContract(admin, GnosisSafeProxyFactory);

    const memberToken = await deployContract(admin, MemberToken);
    const safeTeller = await deployContract(admin, SafeTeller);
    const ownerToken = await deployContract(admin, OwnerToken);

    const ruleManager = await deployMockContract(admin, RuleManager.abi);
    await ruleManager.mock.hasRules.returns(false);
    // user is compliant if there are no rules
    await ruleManager.mock.isRuleCompliant.returns(true);

    orcaProtocol = await deployContract(admin, OrcaProtocol, [
      memberToken.address,
      ruleManager.address,
      safeTeller.address,
      ownerToken.address,
    ]);

    await memberToken.connect(admin).updateController(orcaProtocol.address);
    await safeTeller.connect(admin).updateController(orcaProtocol.address);

    await safeTeller
      .connect(admin)
      .updateSafeAddresses(gnosisSafeProxyFactory.address, gnosisSafeMaster.address, TX_OPTIONS);

    const podSafe = await createPodSafe();
    const ethersSafe = await createSafeSigner(podSafe, admin);

    return { memberToken, ownerToken, ethersSafe, safeTeller };
  };

  describe("new pod creation with safe deployment", () => {
    it("should create a new safe with safe teller module", async () => {
      const { safeTeller, ethersSafe } = await setup();

      // threshold and owners
      expect(await ethersSafe.getThreshold()).to.equal(THRESHOLD);
      expect(await ethersSafe.getOwners()).to.deep.equal(MEMBERS);
      // check to see if module has been enabled
      expect(await ethersSafe.isModuleEnabled(safeTeller.address)).to.equal(true);
    });

    it("should distribute member and owner tokens", async () => {
      const { ownerToken, memberToken } = await setup();

      // should mint owner token
      expect(await ownerToken.balanceOf(owner.address)).to.equal(1);
      // should mint member tokens
      expect(await memberToken.balanceOf(alice.address, POD_ID)).to.equal(1);
      expect(await memberToken.balanceOf(bob.address, POD_ID)).to.equal(1);
    });
  });

  describe("managing pod owners with membership NFTs", () => {
    let memberToken;
    let ethersSafe;

    beforeEach(async () => {
      ({ memberToken, ethersSafe } = await setup());
    });

    it("should be able to transfer memberships", async () => {
      await memberToken.connect(alice).safeTransferFrom(alice.address, charlie.address, POD_ID, 1, "0x");
      // check token balance
      expect(await memberToken.balanceOf(alice.address, POD_ID)).to.equal(0);
      expect(await memberToken.balanceOf(charlie.address, POD_ID)).to.equal(1);
      // check safe owners
      expect(await ethersSafe.getOwners()).to.deep.equal([charlie.address, bob.address]);
    });

    it("should be able to burn memberships", async () => {
      await memberToken.connect(owner).burn(alice.address, POD_ID);
      // check token balance
      expect(await memberToken.balanceOf(alice.address, POD_ID)).to.equal(0);
      // check safe owners
      expect(await ethersSafe.getOwners()).to.deep.equal([bob.address]);
    });

    it("should be able to mint memberships", async () => {
      await memberToken.connect(owner).mint(charlie.address, POD_ID, "0x");
      // check token balance
      expect(await memberToken.balanceOf(charlie.address, POD_ID)).to.equal(1);
      // check safe owners
      expect(await ethersSafe.getOwners()).to.deep.equal([charlie.address, alice.address, bob.address]);
    });
  });
});
