const { expect, use } = require("chai");
const { waffle, ethers } = require("hardhat");

const gnosisSafeAbi = require("../abis/GnosisSafe.json");
const gnosisProxyFactoryAbi = require("../abis/GnosisProxyFactory.json");

const SafeOwner = require("../artifacts/contracts/sandbox/gnosis/SafeOwner.sol/SafeOwner.json");
const MintTest = require("../artifacts/contracts/sandbox/gnosis/MintTest.sol/MintTest.json");
const GnosisSafe = require("../artifacts/contracts/sandbox/gnosis/sc/contracts/GnosisSafe.sol/GnosisSafe.json");

const { provider, solidity, deployContract } = waffle;

use(solidity);

describe("Gnosis Tests", () => {
  const [admin] = provider.getWallets();
  const gnosisSafe = new ethers.Contract("0x34CfAC646f301356fAa8B21e94227e3583Fe3F5F", gnosisSafeAbi, provider);

  // 0x76E2cFc1F5Fa8F6a5b3fC4c8F4788F0116861F9B
  const gnosisProxyFactory = new ethers.Contract(
    "0x76E2cFc1F5Fa8F6a5b3fC4c8F4788F0116861F9B",
    gnosisProxyFactoryAbi,
    provider,
  );

  let mintTest;
  let gnosisProxyContract;
  let safeOwner;

  it("deploy token contract", async () => {
    mintTest = await deployContract(admin, MintTest);
  });

  it("check contract version", async () => {
    const version = await gnosisSafe.VERSION();
    await expect(version).to.equal("1.1.1");
  });

  it("create proxy with no data", async () => {
    await expect(gnosisProxyFactory.connect(admin).createProxy(gnosisSafe.address, [])).to.emit(
      gnosisProxyFactory,
      "ProxyCreation",
    );
  });

  it("create proxy with data and check owners", async () => {
    // setup params
    const owners = [admin.address];
    const threshold = 1;
    const to = ethers.constants.AddressZero;
    const data = "0x";
    const fallbackHandler = ethers.constants.AddressZero;
    const paymentToken = ethers.constants.AddressZero;
    const payment = 0;
    const paymentReceiver = ethers.constants.AddressZero;

    const encodedSetup = gnosisSafe.interface.encodeFunctionData("setup", [
      owners,
      threshold,
      to,
      data,
      fallbackHandler,
      paymentToken,
      payment,
      paymentReceiver,
    ]);

    const createProxy = await gnosisProxyFactory.connect(admin).createProxy(gnosisSafe.address, encodedSetup);

    const creationReceipt = await createProxy.wait();
    const proxyContractAddress = creationReceipt.events[0].args.proxy;
    await expect(proxyContractAddress).to.be.properAddress;

    gnosisProxyContract = new ethers.Contract(proxyContractAddress, gnosisSafeAbi, provider);

    // check  that the owner has been set correctly
    const proxyOwners = await gnosisProxyContract.getOwners();

    await expect(proxyOwners.length).to.be.equal(1);
    await expect(proxyOwners[0]).to.be.equal(admin.address);
  });

  it("deploy a SafeOwner test contract", async () => {
    // safeOwner = await deployContract(admin, SafeOwner);
    const cf = new ethers.ContractFactory(SafeOwner.abi, SafeOwner.bytecode, admin);
    safeOwner = await cf.deploy({ gasLimit: "0x90F560" });
  });

  it("create a safe in test contract - no setup data", async () => {
    await expect(safeOwner.connect(admin).createProxyNoData()).to.be.not.reverted;
  });

  it("create a safe in test contract with setup data", async () => {
    // TODO: figure out address array issue
    const transaction = await safeOwner.connect(admin).createProxyWithData();
    const result = await transaction.wait();

    const proxyContractAddress = result.events[1].args.contractAddress;
    await expect(proxyContractAddress).to.be.properAddress;

    gnosisProxyContract = new ethers.Contract(proxyContractAddress, gnosisSafeAbi, provider);
    // check  that the owner has been set correctly
    const proxyOwners = await gnosisProxyContract.getOwners();
    await expect(proxyOwners.length).to.be.equal(1);
    await expect(proxyOwners[0]).to.be.equal(safeOwner.address);
  });

  it("execute a transaction", async () => {
    await expect(safeOwner.connect(admin).executeTransaction(mintTest.address, { gasLimit: "9500000" })).to.emit(
      gnosisProxyContract,
      "ExecutionSuccess",
    );

    const testValue = await mintTest.test();
    await expect(testValue).to.equal(10);
  });
});
