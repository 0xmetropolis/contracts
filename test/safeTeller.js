const { expect, use } = require("chai");
const { waffle, ethers } = require("hardhat");

const EthersSafe = require("@gnosis.pm/safe-core-sdk").default;

const GnosisSafe = require("@gnosis.pm/safe-contracts/build/artifacts/contracts/GnosisSafe.sol/GnosisSafe.json");
const GnosisSafeProxyFactory = require("@gnosis.pm/safe-contracts/build/artifacts/contracts/proxies/GnosisSafeProxyFactory.sol/GnosisSafeProxyFactory.json");
const MultiSend = require("@gnosis.pm/safe-contracts/build/artifacts/contracts/libraries/MultiSend.sol/MultiSend.json");

const SafeTeller = require("../artifacts/contracts/SafeTeller.sol/SafeTeller.json");

const { deployContract, provider, solidity } = waffle;

use(solidity);

describe("SafeTeller test", () => {
  const [admin, mockController, mockSafeTeller, mockModule, alice, bob, charlie] = provider.getWallets();

  let multiSend;

  const { AddressZero } = ethers.constants;

  const TX_OPTIONS = { gasLimit: 4000000 };

  const THRESHOLD = 1;
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

  const setup = async () => {
    // Deploy the master safe contract and multisend
    multiSend = await deployContract(admin, MultiSend);
    const gnosisSafeMaster = await deployContract(admin, GnosisSafe);
    const gnosisSafeProxyFactory = await deployContract(admin, GnosisSafeProxyFactory);

    const safeTeller = await deployContract(admin, SafeTeller, [
      gnosisSafeProxyFactory.address,
      gnosisSafeMaster.address,
    ]);

    await safeTeller.connect(admin).updateController(mockController.address);

    const res = await safeTeller.connect(mockController).createSafe(POD_ID, MEMBERS, THRESHOLD);
    const { args } = (await res.wait()).events.find(elem => elem.event === "CreateSafe");

    const safe = new ethers.Contract(args.safeAddress, GnosisSafe.abi, admin);

    const ethersSafe = await createSafeSigner(safe, admin);

    return { safeTeller, ethersSafe, safe, gnosisSafeMaster };
  };

  describe("new safe setup", () => {
    it("should create a new safe with safe teller module", async () => {
      const { safeTeller } = await setup();

      const res = await safeTeller.connect(mockController).createSafe(POD_ID + 1, MEMBERS, THRESHOLD);
      const { args } = (await res.wait()).events.find(elem => elem.event === "CreateSafe");
      const safe = new ethers.Contract(args.safeAddress, GnosisSafe.abi, admin);

      const ethersSafe = await createSafeSigner(safe, admin);

      // threshold and owners
      expect(await ethersSafe.getThreshold()).to.equal(THRESHOLD);
      expect(await ethersSafe.getOwners()).to.deep.equal(MEMBERS);
      // check to see if module has been enabled
      expect(await ethersSafe.isModuleEnabled(safeTeller.address)).to.equal(true);
    });

    it("should throw error if user calls create safe", async () => {
      const { safeTeller } = await setup();

      await expect(safeTeller.connect(admin).createSafe(POD_ID, MEMBERS, THRESHOLD, TX_OPTIONS)).to.be.revertedWith(
        "!controller",
      );
    });

    it("should throw error on bad safe setup", async () => {
      const { safeTeller } = await setup();

      await expect(
        safeTeller.connect(mockController).createSafe(POD_ID + 1, MEMBERS, 0, TX_OPTIONS),
      ).to.be.revertedWith("Create Proxy With Data Failed");
    });
  });

  describe("onMint", () => {
    it("should mint new safe owners", async () => {
      const { safeTeller, ethersSafe, safe } = await setup();

      await safeTeller.connect(mockController).onMint(charlie.address, safe.address);
      expect(await ethersSafe.getOwners()).to.deep.equal([charlie.address, ...MEMBERS]);
    });

    it("should throw error on if user calls mint", async () => {
      const { safeTeller, safe } = await setup();
      await expect(safeTeller.connect(admin).onMint(charlie.address, safe.address)).to.be.revertedWith("!controller");
    });

    it("should throw error on invalid mint", async () => {
      const { safeTeller, safe } = await setup();
      await expect(safeTeller.connect(mockController).onMint(AddressZero, safe.address)).to.be.revertedWith(
        "Module Transaction Failed",
      );
    });
  });

  describe("onBurn", () => {
    it("should burn safe owners", async () => {
      const { safeTeller, ethersSafe, safe } = await setup();

      await safeTeller.connect(mockController).onBurn(bob.address, safe.address);
      expect(await ethersSafe.getOwners()).to.deep.equal([alice.address]);
    });

    it("should throw error on if user calls burn", async () => {
      const { safeTeller, safe } = await setup();
      await expect(safeTeller.connect(admin).onBurn(bob.address, safe.address)).to.be.revertedWith("!controller");
    });

    it("should throw error on invalid burn", async () => {
      const { safeTeller, safe } = await setup();
      await expect(safeTeller.connect(mockController).onBurn(charlie.address, safe.address)).to.be.revertedWith(
        "Module Transaction Failed",
      );
    });
  });

  describe("onTransfer", () => {
    it("should transfer safe owners", async () => {
      const { safeTeller, ethersSafe, safe } = await setup();

      await safeTeller.connect(mockController).onTransfer(bob.address, charlie.address, safe.address);
      expect(await ethersSafe.getOwners()).to.deep.equal([alice.address, charlie.address]);
    });

    it("should throw error on if user calls transfer", async () => {
      const { safeTeller, safe } = await setup();
      await expect(safeTeller.connect(admin).onTransfer(bob.address, charlie.address, safe.address)).to.be.revertedWith(
        "!controller",
      );
    });

    it("should throw error on invalid mint", async () => {
      const { safeTeller, safe } = await setup();
      await expect(
        safeTeller.connect(mockController).onTransfer(bob.address, bob.address, safe.address),
      ).to.be.revertedWith("Module Transaction Failed");
    });
  });

  describe("safeTeller migration", () => {
    it("should migrate to a new version of the safeTeller", async () => {
      const { safeTeller, ethersSafe, safe } = await setup();

      await safeTeller.connect(mockController).migrateSafeTeller(safe.address, mockSafeTeller.address, TX_OPTIONS);
      expect(await ethersSafe.isModuleEnabled(mockSafeTeller.address)).to.equal(true);
      expect(await ethersSafe.isModuleEnabled(safeTeller.address)).to.equal(false);
    });

    it("should throw error if user tries to migrate safeTeller", async () => {
      const { safeTeller, safe } = await setup();

      await expect(
        safeTeller.connect(alice).migrateSafeTeller(safe.address, mockSafeTeller.address, TX_OPTIONS),
      ).to.be.revertedWith("!controller");
    });

    it("should migrate to a new version of the safeTeller with multiple modules", async () => {
      const { safeTeller, ethersSafe, safe } = await setup();

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

      await safeTeller.connect(mockController).migrateSafeTeller(safe.address, mockSafeTeller.address, TX_OPTIONS);
      expect(await ethersSafe.isModuleEnabled(mockSafeTeller.address)).to.equal(true);
      expect(await ethersSafe.isModuleEnabled(safeTeller.address)).to.equal(false);
    });
  });
});
