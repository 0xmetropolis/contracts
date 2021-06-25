const { expect, use } = require("chai");
const { waffle, ethers, network } = require("hardhat");

const gnosisSafeAbi = require("../abis/GnosisSafe.json");

const { provider, solidity } = waffle;

use(solidity);

before(async () => {
  // setup mainnet fork
  await network.provider.request({
    method: "hardhat_reset",
    params: [
      {
        forking: {
          jsonRpcUrl: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_TOKEN}`,
          blockNumber: 11095000,
        },
      },
    ],
  });
});

describe("Mainnet Fork Test", () => {
  const gnosisSafe = new ethers.Contract("0x34CfAC646f301356fAa8B21e94227e3583Fe3F5F", gnosisSafeAbi, provider);

  it("check contract version", async () => {
    const version = await gnosisSafe.VERSION();
    await expect(version).to.equal("1.1.1");
  });
});
