const { expect, use } = require("chai");
const { waffle, ethers } = require("hardhat");

const OrcaProtocol = require("../artifacts/contracts/OrcaProtocol.sol/OrcaProtocol.json");
const OrcaMemberToken = require("../artifacts/contracts/OrcaMemberToken.sol/OrcaMemberToken.json");
const OrcaToken = require("../artifacts/contracts/OrcaToken.sol/OrcaToken.json");
const OrcaPodManager = require("../artifacts/contracts/OrcaPodManager.sol/OrcaPodManager.json");

const { deployContract, provider, solidity } = waffle;

use(solidity);

describe("Orca Tests", () => {
  const [wallet, other] = provider.getWallets();

  let orcaProtocol;
  let orcaToken;
  let orcaMemberToken;
  let orcaPodManager;

  it("should deploy contracts", async () => {
    orcaToken = await deployContract(wallet, OrcaToken);
    orcaMemberToken = await deployContract(wallet, OrcaMemberToken);
    orcaProtocol = await deployContract(wallet, OrcaProtocol, [orcaMemberToken.address]);

    // Grab manager address from the constructor event
    const [event] = await orcaProtocol.queryFilter("ManagerAddress");

    orcaPodManager = new ethers.Contract(event.args[0], OrcaPodManager.abi, wallet);
  });

  it("should create a pod", async () => {
    /*
    OrcaProtocol- createPod

    uint256 podId,
    uint256 totalSupply,
    address erc20Address,
    uint256 minimumBalance,
    uint256 votingPeriod,
    uint256 minQuorum
    */
    await expect(orcaProtocol.createPod(1, 10, orcaToken.address, 5, 1, 1))
      .to.emit(orcaProtocol, "CreatePod")
      .withArgs(1)
      .to.emit(orcaPodManager, "CreateRule")
      .withArgs(1, orcaToken.address, 5);
  });

  it("should not claim membership without min tokens", async () => {
    await expect(orcaPodManager.claimMembership(1)).to.be.revertedWith("Not Enough Tokens");
  });

  it("should claim membership with min tokens", async () => {
    // can only use changeTokenBalance with ERC20/721
    await expect(() => orcaToken.mint()).to.changeTokenBalance(orcaToken, wallet, 6);

    await expect(orcaPodManager.claimMembership(1))
      .to.emit(orcaMemberToken, "TransferSingle")
      .withArgs(orcaPodManager.address, orcaPodManager.address, wallet.address, 1, 1);
  });
});
