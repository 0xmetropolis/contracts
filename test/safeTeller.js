const { expect, use } = require("chai");
const { waffle, ethers, deployments } = require("hardhat");
const { default: ENS, labelhash } = require("@ensdomains/ensjs");

const EthersSafe = require("@gnosis.pm/safe-core-sdk").default;

const GnosisSafe = require("@gnosis.pm/safe-contracts/build/artifacts/contracts/GnosisSafe.sol/GnosisSafe.json");
const MultiSend = require("@gnosis.pm/safe-contracts/build/artifacts/contracts/libraries/MultiSend.sol/MultiSend.json");

const { deployContract, provider, solidity } = waffle;

const AddressOne = "0x0000000000000000000000000000000000000001";

use(solidity);

describe("SafeTeller test", () => {
  const [admin, alice, bob, charlie, mockModule] = provider.getWallets();

  let multiSend;
  let ens;

  const { HashZero } = ethers.constants;

  const TX_OPTIONS = { gasLimit: 4000000 };

  const THRESHOLD = 1;
  const MEMBERS = [alice.address, bob.address];
  const POD_ID = 0;
  const IMAGE_URL = "https://testurl.com/";

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
    await deployments.fixture(["Base", "Registrar", "Controller", "ControllerV1"]);
    // Deploy the master safe contract and multisend
    multiSend = await deployContract(admin, MultiSend);

    const controller = await ethers.getContract("ControllerV1", admin);

    const memberToken = await ethers.getContract("MemberToken", admin);
    const gnosisSafeProxyFactory = await ethers.getContract("GnosisSafeProxyFactory", admin);
    const gnosisSafeMaster = await ethers.getContract("GnosisSafe", admin);
    const fallbackHandler = await ethers.getContract("CompatibilityFallbackHandler", admin);

    const controllerRegistry = await ethers.getContract("ControllerRegistry", admin);
    const podEnsRegistrar = await ethers.getContract("PodEnsRegistrar", admin);
    await podEnsRegistrar.setRestrictionState(2); // 2 == open enrollment

    const ensRegistry = await ethers.getContract("ENSRegistry", admin);

    ens = new ENS({ provider, ensAddress: ensRegistry.address });

    const res = await controller
      .connect(alice)
      .createPod(MEMBERS, THRESHOLD, alice.address, labelhash("test"), "test.pod.eth", 0, "https://testUrl/");

    const { args } = (await res.wait()).events.find(elem => elem.event === "CreatePod");

    const safe = new ethers.Contract(args.safe, GnosisSafe.abi, alice);

    const ethersSafe = await createSafeSigner(safe, alice);

    return {
      controller,
      controllerRegistry,
      ethersSafe,
      safe,
      gnosisSafeProxyFactory,
      gnosisSafeMaster,
      memberToken,
      podEnsRegistrar,
      fallbackHandler,
    };
  };

  describe("new safe setup", () => {
    it("should create a new safe with safe teller module", async () => {
      const { controller } = await setup();

      const res = await controller
        .connect(alice)
        .createPod(MEMBERS, THRESHOLD, alice.address, labelhash("test2"), "test2.pod.eth", POD_ID + 1, IMAGE_URL);

      const { args } = (await res.wait()).events.find(elem => elem.event === "CreatePod");
      const safe = new ethers.Contract(args.safe, GnosisSafe.abi, alice);

      const ethersSafe = await createSafeSigner(safe, alice);

      // threshold and owners
      expect(await ethersSafe.getThreshold()).to.equal(THRESHOLD);
      expect(await ethersSafe.getOwners()).to.deep.equal(MEMBERS);
      // check to see if module has been enabled
      expect(await ethersSafe.isModuleEnabled(controller.address)).to.equal(true);
      // check reverse resolver
      expect(await ens.getName(args.safe)).to.deep.equal({ name: "test2.pod.eth" });
    });

    it("should throw error on bad safe setup", async () => {
      const { controller } = await setup();

      await expect(
        controller
          .connect(admin)
          .createPod(MEMBERS, 0, admin.address, labelhash("test2"), "test2.pod.eth", POD_ID + 1, IMAGE_URL),
      ).to.be.revertedWith("Create Proxy With Data Failed");
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

  // Test forward compatibility
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
        podEnsRegistrar,
        fallbackHandler,
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

      const Controller = await deployments.getArtifact("ControllerV1");

      const controller2 = await deployContract(admin, Controller, [
        memberToken.address,
        controllerRegistry.address,
        gnosisSafeProxyFactory.address,
        gnosisSafeMaster.address,
        podEnsRegistrar.address,
        fallbackHandler.address,
      ]);

      await controllerRegistry.connect(admin).registerController(controller2.address);

      const modules = await safe.getModulesPaginated(AddressOne, 3);

      await controller.connect(alice).migratePodController(POD_ID, controller2.address, modules.array[0], TX_OPTIONS);
      expect(await ethersSafe.isModuleEnabled(controller2.address)).to.equal(true);
      expect(await ethersSafe.isModuleEnabled(controller.address)).to.equal(false);
    });
  });
});
