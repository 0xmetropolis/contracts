const { expect, use } = require("chai");
const { waffle, ethers } = require("hardhat");

const EthersSafe = require("@gnosis.pm/safe-core-sdk").default;

const GnosisSafe = require("@gnosis.pm/safe-contracts/build/artifacts/contracts/GnosisSafe.sol/GnosisSafe.json");
const GnosisSafeProxyFactory = require("@gnosis.pm/safe-contracts/build/artifacts/contracts/proxies/GnosisSafeProxyFactory.sol/GnosisSafeProxyFactory.json");
const MultiSend = require("@gnosis.pm/safe-contracts/build/artifacts/contracts/libraries/MultiSend.sol/MultiSend.json");

const Controller = require("../artifacts/contracts/Controller.sol/Controller.json");
const MemberToken = require("../artifacts/contracts/MemberToken.sol/MemberToken.json");
const RuleManager = require("../artifacts/contracts/RuleManager.sol/RuleManager.json");
const SafeTeller = require("../artifacts/contracts/SafeTeller.sol/SafeTeller.json");

const { deployContract, deployMockContract, provider, solidity } = waffle;

use(solidity);

describe("Controller safe integration test", () => {
  const [admin, alice, bob, charlie] = provider.getWallets();

  let multiSend;
  let controller;

  const { HashZero } = ethers.constants;

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
    await controller.connect(admin).createPod(POD_ID, MEMBERS, THRESHOLD, admin.address, TX_OPTIONS);
    // query the new gnosis safe
    const safeAddress = await controller.safeAddress(POD_ID);
    return new ethers.Contract(safeAddress, GnosisSafe.abi, admin);
  };

  const setup = async () => {
    // Deploy the master safe contract and multisend
    multiSend = await deployContract(admin, MultiSend);
    const gnosisSafeMaster = await deployContract(admin, GnosisSafe);
    const gnosisSafeProxyFactory = await deployContract(admin, GnosisSafeProxyFactory);

    const memberToken = await deployContract(admin, MemberToken);
    const safeTeller = await deployContract(admin, SafeTeller, [
      gnosisSafeProxyFactory.address,
      gnosisSafeMaster.address,
    ]);

    const ruleManager = await deployMockContract(admin, RuleManager.abi);
    await ruleManager.mock.hasRules.returns(false);
    // user is compliant if there are no rules
    await ruleManager.mock.isRuleCompliant.returns(true);

    controller = await deployContract(admin, Controller, [
      memberToken.address,
      ruleManager.address,
      safeTeller.address,
    ]);

    await memberToken.connect(admin).registerController(controller.address);
    await safeTeller.connect(admin).updateController(controller.address);

    const podSafe = await createPodSafe();
    const ethersSafe = await createSafeSigner(podSafe, admin);

    return { memberToken, ethersSafe, safeTeller };
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

    it("should distribute member tokens and set admin", async () => {
      const { memberToken } = await setup();

      // should set admin
      expect(await controller.podAdmin(POD_ID)).to.equal(admin.address);
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
      await memberToken
        .connect(alice)
        .safeTransferFrom(alice.address, charlie.address, POD_ID, 1, HashZero, TX_OPTIONS);
      // check token balance
      expect(await memberToken.balanceOf(alice.address, POD_ID)).to.equal(0);
      expect(await memberToken.balanceOf(charlie.address, POD_ID)).to.equal(1);
      // check safe owners
      expect(await ethersSafe.getOwners()).to.deep.equal([charlie.address, bob.address]);
    });

    it("should be able to burn memberships", async () => {
      await memberToken.connect(admin).burn(alice.address, POD_ID, TX_OPTIONS);
      // check token balance
      expect(await memberToken.balanceOf(alice.address, POD_ID)).to.equal(0);
      // check safe owners
      expect(await ethersSafe.getOwners()).to.deep.equal([bob.address]);
    });

    it("should be able to mint memberships", async () => {
      await memberToken.connect(admin).mint(charlie.address, POD_ID, HashZero);
      // check token balance
      expect(await memberToken.balanceOf(charlie.address, POD_ID)).to.equal(1);
      // check safe owners
      expect(await ethersSafe.getOwners()).to.deep.equal([charlie.address, alice.address, bob.address]);
    });
  });
});
