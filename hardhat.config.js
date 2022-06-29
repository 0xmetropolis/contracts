/* eslint-disable no-console */
const { ENSRegistry, PublicResolver, ReverseRegistrar } = require("@ensdomains/ens-contracts");
const { getEnsAddress, getResolverContract, getName } = require("@ensdomains/ensjs");
const ENS = require("@ensdomains/ensjs").default;
const namehash = require("@ensdomains/eth-ens-namehash");
const { ethers } = require("ethers");
const { task } = require("hardhat/config");
const { utils } = require("web3");

const fs = require("fs");

/* eslint-disable import/no-extraneous-dependencies */
require("hardhat-preprocessor");
require("@nomiclabs/hardhat-waffle");
require("hardhat-gas-reporter");
require("solidity-coverage");
require("hardhat-deploy");
require("@nomiclabs/hardhat-ethers");
require("@tenderly/hardhat-tenderly");
require("dotenv").config();

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

task("tenderly-verify", "verifies current deployment on tenderly").setAction(
  async (args, { tenderly, deployments }) => {
    const contracts = [
      // { name: "Controller", address: (await deployments.get("Controller")).address },
      { name: "ControllerV1", address: (await deployments.get("ControllerV1")).address },
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

    const controller = args.controller || (await deployments.get("ControllerV1", deployer)).address;

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

task("update-registrar", "upgrade controller to new registrar").setAction(
  async (args, { getNamedAccounts, ethers, deployments }) => {
    const { deployer } = await getNamedAccounts();
    const { address: podEnsRegistrarAddress } = await ethers.getContract("PodEnsRegistrar", deployer);

    const controller = await ethers.getContract("Controller", deployer);

    await controller.updatePodEnsRegistrar(podEnsRegistrarAddress);
    console.log(`Updated ${controller.address} with PodEnsRegistrar ${podEnsRegistrarAddress}`);
  },
);

task("update-subnode-owner", "updates the ENS owner for a list of pod IDs")
  .addPositionalParam("startPod")
  .addOptionalPositionalParam("endPod")
  .setAction(async (args, { getChainId, ethers }) => {
    const { startPod, endPod } = args;
    const network = await getChainId();
    const ens = new ENS({ provider: ethers.provider, ensAddress: getEnsAddress(network) });
    const controller = await ethers.getContract("Controller");
    const { address: newRegistrar } = await ethers.getContract("PodEnsRegistrar");
    console.log("newRegistrar", newRegistrar);
    const ROOT = network === "1" ? "pod.xyz" : "pod.eth";

    // Generate an array of pod IDs.
    const podIds = [];
    if (!endPod) {
      podIds.push(startPod);
    } else {
      for (let i = parseInt(startPod, 10); i <= parseInt(endPod, 10); i += 1) {
        podIds.push(i);
      }
    }

    const labels = await Promise.all(
      podIds.map(async podId => {
        const safe = await controller.podIdToSafe(podId);
        const name = await ens.getName(safe);
        return name.name.split(".")[0];
      }),
    );
    console.log("labels", labels);
    const root = ens.name(ROOT);

    for (let i = 0; i < labels.length; i += 1) {
      // TODO: filter malformed ENS names
      if (labels[i].includes("'")) continue;
      console.log(`migrating subnode ${labels[i]} to ${newRegistrar}`);
      try {
        const res = await root.setSubnodeOwner(namehash.normalize(labels[i]), newRegistrar);
        await res.wait(1);
      } catch (err) {
        console.log(err);
        console.log(`Failed on index ${i} - ${labels[i]}`);
        break;
      }
    }
  });

task("add-ens-podid", "updates the ENS owner for a list of pod IDs")
  .addPositionalParam("startPod")
  .addOptionalPositionalParam("endPod")
  .setAction(async (args, { getChainId, ethers }) => {
    const { startPod, endPod } = args;
    const network = await getChainId();
    const ens = new ENS({ provider: ethers.provider, ensAddress: getEnsAddress(network) });
    const controller = await ethers.getContract("Controller");
    const ensRegistrar = await ethers.getContract("PodEnsRegistrar");
    const ROOT = network === "1" ? "pod.xyz" : "pod.eth";

    // Generate an array of pod IDs.
    const podIds = [];
    if (!endPod) {
      podIds.push(startPod);
    } else {
      for (let i = parseInt(startPod, 10); i <= parseInt(endPod, 10); i += 1) {
        podIds.push(i);
      }
    }

    const ensNames = await Promise.all(
      podIds.map(async podId => {
        const safe = await controller.podIdToSafe(podId);
        const { name } = await ens.getName(safe);
        return name;
      }),
    );
    console.log("ensNames", ensNames);

    for (let i = 0; i < ensNames.length; i += 1) {
      // TODO: filter malformed ENS names
      if (ensNames[i].includes("'")) continue;
      console.log(`${ensNames[i]} podId to ${podIds[i].toString()}`);
      try {
        const res = await ensRegistrar.setText(ethers.utils.namehash(ensNames[i]), "podId", podIds[i].toString());
        await res.wait(1);
      } catch (err) {
        console.log(err);
        console.log(`Failed on index ${i} - ${ensNames[i]}`);
        break;
      }
    }
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
        artifacts: "node_modules/@gnosis.pm/zodiac/build/artifacts",
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
