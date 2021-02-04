const { expect, use } = require("chai");
const { waffle } = require("hardhat");

const GenericFunctionTest = require("../artifacts/contracts/sandbox/genericFunctions/GenericFunctionTest.sol/GenericFunctionTest.json");
const BalanceTest = require("../artifacts/contracts/sandbox/genericFunctions/BalanceTest.sol/BalanceTest.json");

const { deployContract, provider, solidity } = waffle;

use(solidity);

describe("Generic Function Tests", () => {
  const [admin] = provider.getWallets();

  let genericFunctionTest;
  let balanceTest;

  // there are require statements in the contract that test functionality
  it("Deploying Contracts and Executing Generic Functions", async () => {
    balanceTest = await deployContract(admin, BalanceTest);
    genericFunctionTest = await deployContract(admin, GenericFunctionTest, [balanceTest.address]);
    const result = await genericFunctionTest.deployTransaction.wait();
    await expect(result.contractAddress).to.be.properAddress;
  });
});
