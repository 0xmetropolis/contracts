const { expect, use } = require("chai");
const { waffle, ethers } = require("hardhat");

const List = require("../artifacts/contracts/rules/List.sol/List.json");
const ListTest = require("../artifacts/contracts/test/rules/ListTest.sol/ListTest.json");
const RuleManager = require("../artifacts/contracts/RuleManager.sol/RuleManager.json");

const { deployContract, provider, solidity } = waffle;

use(solidity);

describe("List Contract", () => {
  let admin;
  let owner;

  before(async () => {
    [admin, owner] = await ethers.getSigners();
  });

  describe("Interacting with List contract", () => {
    let list;
    let listTest;

    it("should deploy contracts", async () => {
      list = await deployContract(admin, List);
      listTest = await deployContract(admin, ListTest);
    });

    it("should pass member of array solidity test", async () => {
      // callStatic treats a tx as a call so you can get a return value
      expect(await listTest.callStatic.isMemberOfArrayTest(admin.address, [admin.address])).to.equal("success");
      expect(await listTest.callStatic.isMemberOfArrayTest(admin.address, [owner.address])).to.equal(
        "member not found",
      );
      expect(await listTest.callStatic.isMemberOfArrayTest(admin.address, [admin.address, owner.address])).to.equal(
        "success",
      );
    });

    it("should pass member of array encoded solidity test", async () => {
      // callStatic treats a tx as a call so you can get a return value
      expect(await listTest.callStatic.isMemberOfArrayEncodedTest(admin.address, [admin.address])).to.equal("success");
      expect(await listTest.callStatic.isMemberOfArrayEncodedTest(admin.address, [owner.address])).to.equal(
        "member not found",
      );
      expect(
        await listTest.callStatic.isMemberOfArrayEncodedTest(admin.address, [admin.address, owner.address]),
      ).to.equal("success");
    });

    it("should return 1 if address is member of array", async () => {
      expect(await list.connect(admin).isMemberOfArray(admin.address, [owner.address, admin.address])).to.be.equal(1);
    });

    it("should return 0 if address is not member of array", async () => {
      expect(await list.connect(admin).isMemberOfArray(admin.address, [owner.address, owner.address])).to.be.equal(0);
    });
  });
});
