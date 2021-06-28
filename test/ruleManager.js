const { expect, use } = require("chai");
const { waffle, ethers } = require("hardhat");

const RuleManager = require("../artifacts/contracts/RuleManager.sol/RuleManager.json");
const List = require("../artifacts/contracts/rules/List.sol/List.json");

const { deployContract, provider, solidity } = waffle;

use(solidity);

describe("Rule List", () => {
  let admin;
  let owner;

  before(async () => {
    [admin, owner] = await ethers.getSigners();
  });

  let list;
  let ruleManager;

  it("should deploy contracts", async () => {
    ruleManager = await deployContract(admin, ruleManager);
    list = await deployContract(admin, List);
  });
});
