/* eslint-disable no-undef */
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

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    compilers: [{ version: "0.8.7" }, { version: "0.7.4" }],
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
