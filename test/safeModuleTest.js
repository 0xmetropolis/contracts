const { expect, use } = require("chai");
const { waffle, ethers } = require("hardhat");

const EthersSafe = require("@gnosis.pm/safe-core-sdk").default;

const GnosisSafe = require("@gnosis.pm/safe-contracts/build/artifacts/contracts/GnosisSafe.sol/GnosisSafe.json");
const GnosisSafeProxyFactory = require("@gnosis.pm/safe-contracts/build/artifacts/contracts/proxies/GnosisSafeProxyFactory.sol/GnosisSafeProxyFactory.json");
const MultiSend = require("@gnosis.pm/safe-contracts/build/artifacts/contracts/libraries/MultiSend.sol/MultiSend.json");

const SafeModuleOwnerTest = require("../artifacts/contracts/test/SafeModuleOwnerTest.sol/SafeModule.json");

const { provider, solidity, deployContract } = waffle;

use(solidity);

const { AddressZero } = ethers.constants;

describe("Safe Module Owner Test", () => {
  const [admin, alice, bob, charlie, dave, edward] = provider.getWallets();

  let gnosisSafe;
  let multiSend;

  const PAYMENT_TOKEN = AddressZero;
  const PAYMENT = 0;
  const PAYMENT_RECEIVER = AddressZero;

  const OWNERS = [alice.address, bob.address, charlie.address];

  // static async create({ ethers, safeAddress, providerOrSigner, contractNetworks }) {
  const createSafeSigner = async signer => {
    const { chainId } = await provider.getNetwork();
    return EthersSafe.create({
      ethers,
      safeAddress: gnosisSafe.address,
      providerOrSigner: signer,
      contractNetworks: {
        [chainId]: {
          multiSendAddress: multiSend.address,
        },
      },
    });
  };

  it("should set up safe", async () => {
    // // Deploy the master safe contract and multisend
    multiSend = await deployContract(admin, MultiSend);
    const gnosisSafeMaster = await deployContract(admin, GnosisSafe);
    const gnosisSafeProxyFactory = await deployContract(admin, GnosisSafeProxyFactory);

    // Create a proxy from the master safe contract
    const proxyAddress = await gnosisSafeProxyFactory.callStatic.createProxy(gnosisSafeMaster.address, "0x");
    await gnosisSafeProxyFactory.createProxy(gnosisSafeMaster.address, "0x").then(tx => tx.wait());

    // Init the proxy to the gnosis safe abi
    gnosisSafe = gnosisSafeMaster.attach(proxyAddress);

    const THRESHOLD = 2;
    const TO = AddressZero;
    const DATA = "0x";
    const FALLBACK = AddressZero;

    await gnosisSafe
      .connect(admin)
      .setup(OWNERS, THRESHOLD, TO, DATA, FALLBACK, PAYMENT_TOKEN, PAYMENT, PAYMENT_RECEIVER);

    expect(await gnosisSafe.getOwners()).to.deep.equal(OWNERS);
  });

  it("should add owner from an ethers call", async () => {
    const safeSignerAlice = await createSafeSigner(alice);
    const safeSignerBob = await createSafeSigner(bob);
    const safeSignerCharlie = await createSafeSigner(charlie);

    // create safe tx
    const safeTransaction = await safeSignerAlice.getAddOwnerTx(dave.address, 2);

    // sign off chain
    await safeSignerAlice.signTransaction(safeTransaction);

    const safeTxHash = await safeSignerAlice.getTransactionHash(safeTransaction);

    // sign on chain
    const approveRes = await safeSignerBob.approveTransactionHash(safeTxHash);
    await approveRes.wait();

    const execRes = await safeSignerCharlie.executeTransaction(safeTransaction);
    await execRes.wait();

    // will only get onchain signers
    expect(await safeSignerBob.getOwnersWhoApprovedTx(safeTxHash)).to.contain(bob.address);

    expect(await gnosisSafe.getOwners()).to.deep.equal([dave.address, ...OWNERS]);
  });

  let safeModuleOwnerTest;

  it("should add owner from SafeModuleOwnerTest contract", async () => {
    safeModuleOwnerTest = await deployContract(alice, SafeModuleOwnerTest, [gnosisSafe.address]);

    // safeSdk.getEnableModuleTx doesn't work so creating tx manually
    const txArgs = {
      to: gnosisSafe.address,
      data: gnosisSafe.interface.encodeFunctionData("enableModule", [safeModuleOwnerTest.address]),
      value: 0,
    };

    const safeSignerAlice = await createSafeSigner(alice);
    const safeSignerBob = await createSafeSigner(bob);

    const safeTransaction = await safeSignerAlice.createTransaction(txArgs);

    // sign offchain
    await safeSignerAlice.signTransaction(safeTransaction);

    // execute onchain
    const txRes = await safeSignerBob.executeTransaction(safeTransaction);
    await txRes.wait();

    expect(await safeSignerBob.isModuleEnabled(safeModuleOwnerTest.address)).to.equal(true);

    await safeModuleOwnerTest.addOwnerWithThreshold(edward.address, 2);

    expect(await gnosisSafe.getOwners()).to.deep.equal([edward.address, dave.address, ...OWNERS]);
  });
});
