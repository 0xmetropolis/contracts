/* eslint-disable no-console */
const { ethers } = require("ethers");

const fs = require("fs");

/* eslint-disable import/no-extraneous-dependencies */
require("hardhat-preprocessor");
require("hardhat-gas-reporter");
require("solidity-coverage");
require("hardhat-deploy");
require("@nomiclabs/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("@tenderly/hardhat-tenderly");
require("dotenv").config();
require("./hardhat.tasks");

function getRemappings() {
  return fs
    .readFileSync("remappings.txt", "utf8")
    .split("\n")
    .filter(Boolean) // remove empty lines
    .map(line => line.trim().split("="));
}

const networks = {
  hardhat: {
    gas: 12000000,
    blockGasLimit: 0xbebc20,
    allowUnlimitedContractSize: true,
    timeout: 1800000000,
  },
  rinkeby: {
    url: `https://rinkeby.infura.io/v3/${process.env.INFURA_API_KEY}`,
    accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    gasPrice: 10000000000,
  },
  goerli: {
    url: `https://goerli.infura.io/v3/${process.env.INFURA_API_KEY}`,
    accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    gasPrice: 10000000000,
  },
  mainnet: {
    url: `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
    accounts: process.env.MAINNET_PRIVATE_KEY ? [process.env.MAINNET_PRIVATE_KEY] : [],
    gasPrice: ethers.utils.parseUnits("75", "gwei").toNumber(),
    timeout: 1200000, // 20 minute timeout in ms
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
    gasPrice: 260,
    coinmarketcap: process.env.COINMARKETCAP_KEY,
  },
  networks,
  namedAccounts,
  external: {
    contracts: [
      {
        artifacts: "node_modules/@gnosis.pm/safe-contracts/build/artifacts",
      },
    ],
  },
  tenderly: {
    project: "orca",
    username: "dev-sonar",
  },
  preprocess: {
    eachLine: hre => ({
      transform: line => {
        if (line.match(/^\s*import /i)) {
          getRemappings().forEach(([find, replace]) => {
            if (line.match(find)) {
              line = line.replace(find, replace);
            }
          });
        }
        return line;
      },
    }),
  },
};
