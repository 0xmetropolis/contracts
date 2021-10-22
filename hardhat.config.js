/* eslint-disable no-undef */

const { task } = require("hardhat/config");

/* eslint-disable import/no-extraneous-dependencies */
require("@nomiclabs/hardhat-waffle");
require("hardhat-gas-reporter");
require("solidity-coverage");
require("hardhat-deploy");
require("@nomiclabs/hardhat-ethers");
require("@tenderly/hardhat-tenderly");
require("dotenv").config();

const accounts = process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [];

const networks = {
  hardhat: {
    gas: 12000000,
    blockGasLimit: 0xbebc20,
    allowUnlimitedContractSize: true,
    timeout: 1800000000,
    // TODO: london breaks safe-sdk used in tests
    hardfork: "berlin",
  },
  rinkeby: {
    url: `https://rinkeby.infura.io/v3/${process.env.INFURA_API_KEY}`,
    accounts,
  },
};

const namedAccounts = {
  deployer: {
    default: 0,
    rinkeby: 0,
  },
  gnosisDeployer: {
    default: 1,
  },
  ensDeployer: {
    default: 1,
  },
  ensHolder: {
    default: 2,
  },
};

task("tenderly-verify", "verifies current deployment on tenderly").setAction(async () => {
  const contracts = [
    { name: "Controller", address: (await deployments.get("Controller")).address },
    { name: "MemberToken", address: (await deployments.get("MemberToken")).address },
    { name: "ControllerRegistry", address: (await deployments.get("ControllerRegistry")).address },
    { name: "PodEnsRegistrar", address: (await deployments.get("PodEnsRegistrar")).address },
  ];
  await tenderly.verify(...contracts);
});

task("set-ship-state", "sets restrictions to closed, open, onlyShip or onlySafeWithShip")
  .addPositionalParam("state")
  .setAction(async args => {
    const { deployer } = await getNamedAccounts();
    PodEnsRegistrar = await ethers.getContract("PodEnsRegistrar", deployer);

    const stateEnum = {
      onlySafeWithShip: 0,
      onlyShip: 1,
      open: 2,
      closed: 3,
    };

    const { state } = args;

    const currentState = await PodEnsRegistrar.state();
    if (currentState === stateEnum[state]) {
      console.log("Contract was already set to that state");
      return;
    }
    await PodEnsRegistrar.setRestrictionState(stateEnum[state]);
    console.log(`Successfully changed state to ${state}`);
  });

task("mint", "mints tokens to an address, with an optional amount")
  .addPositionalParam("recipient")
  .addOptionalPositionalParam("amount")
  .setAction(async args => {
    const { deployer } = await getNamedAccounts();
    InviteToken = await ethers.getContract("InviteToken", deployer);

    const { recipient, amount } = args;
    await InviteToken.mint(recipient, amount || 1);
    console.log(`Minted ${amount || 1} tokens to ${recipient}`);
  });

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    version: "0.8.7",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000,
      },
    },
  },
  gasReporter: {
    currency: "USD",
    gasPrice: 150,
    coinmarketcap: process.env.COINMARKETCAP_KEY,
  },
  networks,
  namedAccounts,
  external: {
    contracts: [
      {
        artifacts: "node_modules/@gnosis.pm/safe-contracts/build/artifacts",
      },
      {
        artifacts: "node_modules/@ensdomains/ens-contracts/artifacts",
      },
    ],
  },
  tenderly: {
    project: "orca",
    username: "dev-sonar",
  },
};
