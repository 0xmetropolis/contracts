const { expect, use } = require("chai");
const { waffle, ethers } = require("hardhat");

const gnosisSafeAbi = require("../abis/GnosisSafe.json");

const { provider, solidity } = waffle;

use(solidity);

describe("Mainnet Fork Test", () => {
  const gnosisSafe = new ethers.Contract("0x34CfAC646f301356fAa8B21e94227e3583Fe3F5F", gnosisSafeAbi, provider);

  it("check contract version", async () => {
    const version = await gnosisSafe.VERSION();
    await expect(version).to.equal("1.1.1");
  });
});
