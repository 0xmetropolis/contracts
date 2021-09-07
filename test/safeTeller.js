const { expect, use } = require("chai");
const { waffle, ethers } = require("hardhat");

const EthersSafe = require("@gnosis.pm/safe-core-sdk").default;

const GnosisSafe = require("@gnosis.pm/safe-contracts/build/artifacts/contracts/GnosisSafe.sol/GnosisSafe.json");
const GnosisSafeProxyFactory = require("@gnosis.pm/safe-contracts/build/artifacts/contracts/proxies/GnosisSafeProxyFactory.sol/GnosisSafeProxyFactory.json");
const MultiSend = require("@gnosis.pm/safe-contracts/build/artifacts/contracts/libraries/MultiSend.sol/MultiSend.json");

const ControllerRegistry = require("../artifacts/contracts/ControllerRegistry.sol/ControllerRegistry.json");
const Controller = require("../artifacts/contracts/Controller.sol/Controller.json");
const MemberToken = require("../artifacts/contracts/MemberToken.sol/MemberToken.json");

const { deployContract, provider, solidity, deployMockContract } = waffle;

use(solidity);

describe("SafeTeller test", () => {
  const [admin, alice, bob, charlie, mockModule] = provider.getWallets();

  let multiSend;

  const { HashZero } = ethers.constants;

  const TX_OPTIONS = { gasLimit: 4000000 };

  const THRESHOLD = 1;
  const MEMBERS = [alice.address, bob.address];
  const POD_ID = 0;

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

  const setup = async () => {
    // Deploy the master safe contract and multisend
    multiSend = await deployContract(admin, MultiSend);
    const gnosisSafeMaster = await deployContract(admin, GnosisSafe);
    const gnosisSafeProxyFactory = await deployContract(admin, GnosisSafeProxyFactory);

    const controllerRegistry = await deployMockContract(admin, ControllerRegistry.abi);
    await controllerRegistry.mock.isRegistered.returns(true);

    const memberToken = await deployContract(admin, MemberToken, [controllerRegistry.address]);

    const controller = await deployContract(admin, Controller, [
      memberToken.address,
      controllerRegistry.address,
      gnosisSafeProxyFactory.address,
      gnosisSafeMaster.address,
    ]);

    const res = await controller.connect(alice).createPod(MEMBERS, THRESHOLD, alice.address);
    const { args } = (await res.wait()).events.find(elem => elem.event === "CreateSafe");

    const safe = new ethers.Contract(args.safeAddress, GnosisSafe.abi, alice);

    const ethersSafe = await createSafeSigner(safe, alice);

    return { controller, controllerRegistry, ethersSafe, safe, gnosisSafeProxyFactory, gnosisSafeMaster, memberToken };
  };

  describe("new safe setup", () => {
    it("should create a new safe with safe teller module", async () => {
      const { controller } = await setup();

      const res = await controller.connect(alice).createPod(MEMBERS, THRESHOLD, alice.address);
      const { args } = (await res.wait()).events.find(elem => elem.event === "CreateSafe");
      const safe = new ethers.Contract(args.safeAddress, GnosisSafe.abi, alice);

      const ethersSafe = await createSafeSigner(safe, alice);

      // threshold and owners
      expect(await ethersSafe.getThreshold()).to.equal(THRESHOLD);
      expect(await ethersSafe.getOwners()).to.deep.equal(MEMBERS);
      // check to see if module has been enabled
      expect(await ethersSafe.isModuleEnabled(controller.address)).to.equal(true);
    });

    it("should throw error on bad safe setup", async () => {
      const { controller } = await setup();

      await expect(controller.connect(admin).createPod(MEMBERS, 0, admin.address)).to.be.revertedWith(
        "Create Proxy With Data Failed",
      );
    });
  });

  describe("#onMint", () => {
    it("should mint new safe owners", async () => {
      const { memberToken, ethersSafe } = await setup();

      await memberToken.connect(alice).mint(charlie.address, POD_ID, HashZero);
      expect(await ethersSafe.getOwners()).to.deep.equal([charlie.address, ...MEMBERS]);
    });
  });

  describe("#onBurn", () => {
    it("should burn safe owners", async () => {
      const { memberToken, ethersSafe } = await setup();

      await memberToken.connect(alice).burn(bob.address, POD_ID);
      expect(await ethersSafe.getOwners()).to.deep.equal([alice.address]);
    });
  });

  describe("#onTransfer", () => {
    it("should transfer safe owners", async () => {
      const { memberToken, ethersSafe } = await setup();

      await memberToken.connect(bob).safeTransferFrom(bob.address, charlie.address, POD_ID, 1, HashZero);
      expect(await ethersSafe.getOwners()).to.deep.equal([alice.address, charlie.address]);
    });
  });

  describe("when migrating safeTeller", () => {
    it("should migrate to a new version of the safeTeller with multiple modules", async () => {
      const {
        controller,
        ethersSafe,
        safe,
        memberToken,
        controllerRegistry,
        gnosisSafeMaster,
        gnosisSafeProxyFactory,
      } = await setup();

      // safeSdk.getEnableModuleTx doesn't work so creating tx manually
      const txArgs = {
        to: safe.address,
        data: safe.interface.encodeFunctionData("enableModule", [mockModule.address]),
        value: 0,
      };

      const safeSignerAlice = await createSafeSigner(safe, alice);
      const safeTransaction = await safeSignerAlice.createTransaction(txArgs);
      // execute onchain
      const txRes = await safeSignerAlice.executeTransaction(safeTransaction);
      await txRes.wait();
      expect(await ethersSafe.isModuleEnabled(mockModule.address)).to.equal(true);

      const controller2 = await deployContract(admin, Controller, [
        memberToken.address,
        controllerRegistry.address,
        gnosisSafeProxyFactory.address,
        gnosisSafeMaster.address,
      ]);

      await controller.connect(alice).migratePodController(POD_ID, controller2.address, TX_OPTIONS);
      expect(await ethersSafe.isModuleEnabled(controller2.address)).to.equal(true);
      expect(await ethersSafe.isModuleEnabled(controller.address)).to.equal(false);
    });
  });
});
