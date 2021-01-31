const { expect, use } = require("chai");
const { waffle, ethers } = require("hardhat");

const gnosisSafeAbi = require("../abis/GnosisSafe.json");
const gnosisProxyFactoryAbi = require("../abis/GnosisProxyFactory.json");

const { provider, solidity } = waffle;

use(solidity);

describe("Gnosis Tests", () => {
  const [ admin ] = provider.getWallets();
  const gnosisSafe = new ethers.Contract("0x34CfAC646f301356fAa8B21e94227e3583Fe3F5F", gnosisSafeAbi, provider);

  // 0x76E2cFc1F5Fa8F6a5b3fC4c8F4788F0116861F9B
  const gnosisProxyFactory = new ethers.Contract(
    "0x76E2cFc1F5Fa8F6a5b3fC4c8F4788F0116861F9B",
    gnosisProxyFactoryAbi,
    provider,
  );

  it("check contract version", async () => {
    const version = await gnosisSafe.VERSION();
    await expect(version).to.equal("1.1.1");
  });

  it("create proxy with no data", async () => {
    const createProxy = await gnosisProxyFactory.connect(admin).createProxy(gnosisSafe.address, []);
    const proxyAddress = await createProxy.wait();
    console.log(proxyAddress.logs[0]);

    await expect(gnosisProxyFactory.connect(admin).createProxy(gnosisSafe.address, [])).to.emit(
      gnosisProxyFactory,
      "ProxyCreation",
    );
  });
});
