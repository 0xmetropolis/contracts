const { expect, use } = require("chai");
const { waffle, ethers } = require("hardhat");

const OrcaProtocol = require("../artifacts/contracts/OrcaProtocol.sol/OrcaProtocol.json");
const OrcaMemberToken = require("../artifacts/contracts/OrcaMemberToken.sol/OrcaMemberToken.json");
const OrcaToken = require("../artifacts/contracts/OrcaToken.sol/OrcaToken.json");

const { deployContract, provider, solidity } = waffle;

use(solidity);

describe("Orca Tests", () => {
  const [wallet, other] = provider.getWallets();

  let orcaProtocol;
  let orcaToken;
  let orcaMemberToken;

  it("should deploy contracts", async () => {
    orcaToken = await deployContract(wallet, OrcaToken);
    orcaMemberToken = await deployContract(wallet, OrcaMemberToken);
    /*
    OrcaProtocol Constructor

    address orcaPodTokensAddress,
    uint256 podId,
    uint256 totalSupply,
    address erc20Address,
    uint256 minimumBalance,
    uint256 votingPeriod,
    uint256 minQuorum
    */
    orcaProtocol = await deployContract(wallet, OrcaProtocol, [
      orcaMemberToken.address,
      1,
      10,
      orcaToken.address,
      5,
      1,
      1,
    ]);
  });
});
