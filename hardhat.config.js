/* eslint-disable no-console */
const { ENSRegistry } = require("@ensdomains/ens-contracts");
const { getEnsAddress } = require("@ensdomains/ensjs");
const { ethers } = require("ethers");
const { task } = require("hardhat/config");
const { utils } = require("web3");

/* eslint-disable import/no-extraneous-dependencies */
require("@nomiclabs/hardhat-waffle");
require("hardhat-gas-reporter");
require("solidity-coverage");
require("hardhat-deploy");
require("@nomiclabs/hardhat-ethers");
require("@tenderly/hardhat-tenderly");
require("dotenv").config();

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
    accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    gasPrice: 10000000000,
  },
  mainnet: {
    url: `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
    accounts: process.env.MAINNET_PRIVATE_KEY ? [process.env.MAINNET_PRIVATE_KEY] : [],
    gasPrice: 200000000000,
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

task("tenderly-verify", "verifies current deployment on tenderly").setAction(
  async (args, { tenderly, deployments }) => {
    const contracts = [
      { name: "Controller", address: (await deployments.get("Controller")).address },
      { name: "MemberToken", address: (await deployments.get("MemberToken")).address },
      { name: "ControllerRegistry", address: (await deployments.get("ControllerRegistry")).address },
      { name: "PodEnsRegistrar", address: (await deployments.get("PodEnsRegistrar")).address },
    ];
    await tenderly.verify(...contracts);
  },
);

task("set-ship-state", "sets restrictions to closed, open, onlyShip or onlySafeWithShip")
  .addPositionalParam("state")
  .setAction(async (args, { getNamedAccounts, ethers }) => {
    const { deployer } = await getNamedAccounts();
    const podEnsRegistrar = await ethers.getContract("PodEnsRegistrar", deployer);

    const stateEnum = {
      onlySafeWithShip: 0,
      onlyShip: 1,
      open: 2,
      closed: 3,
    };

    const { state } = args;

    const currentState = await podEnsRegistrar.state();
    if (currentState === stateEnum[state]) {
      console.log("Contract was already set to that state");
      return;
    }
    await podEnsRegistrar.setRestrictionState(stateEnum[state]);
    console.log(`Successfully changed state to ${state}`);
  });

task("mint", "mints tokens to an address, with an optional amount")
  .addPositionalParam("recipient")
  .addOptionalPositionalParam("amount")
  .setAction(async (args, { getNamedAccounts, ethers }) => {
    const { deployer } = await getNamedAccounts();
    const inviteToken = await ethers.getContract("InviteToken", deployer);

    const { recipient, amount } = args;
    const res = await inviteToken.mint(recipient, amount || 1);
    console.log(res);
    console.log(`Minted ${amount || 1} tokens to ${recipient}`);
  });

task("set-burner", "registers contract as invite burner").setAction(
  async (args, { getNamedAccounts, ethers, deployments }) => {
    const { deployer } = await getNamedAccounts();
    const inviteToken = await ethers.getContract("InviteToken", deployer);

    const contract = (await deployments.get("PodEnsRegistrar", deployer)).address;
    const tx = await inviteToken.grantRole(inviteToken.BURNER_ROLE(), contract);

    console.log(tx);
    console.log(`Added ${contract} as burner for ${inviteToken.address}`);
  },
);

task("register-controller", "registers controller with controller registry")
  .addOptionalPositionalParam("controller")
  .setAction(async (args, { getNamedAccounts, ethers, deployments }) => {
    const { deployer } = await getNamedAccounts();
    const controllerRegistry = await ethers.getContract("ControllerRegistry", deployer);

    const controller = args.controller || (await deployments.get("Controller", deployer)).address;

    await controllerRegistry.registerController(controller);
    console.log(`Registered ${controller} with controller Registry`);
  });

task("ens-setApproval", "sets ens approval for podEnsRegistrar with ensHolder account")
  .addOptionalPositionalParam("controller")
  .setAction(async (args, { getNamedAccounts, getChainId, ethers, deployments }) => {
    const { ensHolder } = await getNamedAccounts();
    const ensHolderSigner = ethers.provider.getSigner(ensHolder);

    const network = await getChainId();
    const ensRegistryAddress =
      network === "31337" ? (await deployments.get("ENSRegistry")).address : getEnsAddress(network);

    const { address: podEnsRegistrarAddress } = await deployments.get("PodEnsRegistrar");

    const ensRegistry = new ethers.Contract(ensRegistryAddress, ENSRegistry, ensHolderSigner);
    // approve podENSRegistry to make pod.eth changes on behalf of ensHolder
    await ensRegistry.setApprovalForAll(podEnsRegistrarAddress, true);

    console.log(`Set ${ensHolder} approvalForAll for ${podEnsRegistrarAddress} with ens ${ensRegistryAddress}`);
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
