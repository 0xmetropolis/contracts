/* eslint-disable global-require */
/* eslint-disable camelcase */
const { ethers } = require("ethers");

const networkMap = {
  1: "mainnet",
  4: "rinkeby",
};

const contracts = {
  rinkeby: {
    podensregistrar: require("./deployments/rinkeby/PodEnsRegistrar.json"),
    controllerregistry: require("./deployments/rinkeby/ControllerRegistry.json"),
    invitetoken: require("./deployments/rinkeby/InviteToken.json"),
    membertoken: require("./deployments/rinkeby/MemberToken.json"),
    controller: require("./deployments/rinkeby/Controller.json"),
    controllerv1: require("./deployments/rinkeby/ControllerV1.json"),
    controllerv1_1: require("./deployments/rinkeby/ControllerV1.1.json"),
    controllerv1_2: require("./deployments/rinkeby/ControllerV1.2.json"),
  },
  mainnet: {
    podensregistrar: require("./deployments/mainnet/PodEnsRegistrar.json"),
    controllerregistry: require("./deployments/mainnet/ControllerRegistry.json"),
    invitetoken: require("./deployments/mainnet/InviteToken.json"),
    membertoken: require("./deployments/mainnet/MemberToken.json"),
    controller: require("./deployments/mainnet/Controller.json"),
    controllerv1: require("./deployments/mainnet/ControllerV1.json"),
    controllerv1_1: require("./deployments/mainnet/ControllerV1.1.json"),
    controllerv1_2: require("./deployments/mainnet/ControllerV1.2.json"),
  },
};

const controllerLatest = {
  rinkeby: contracts.rinkeby.controllerV1_2,
  mainnet: contracts.mainnet.controllerV1_2,
};

/**
 * Gets the artifact of contract based on contract name string and network
 * @param {string} contractName - The name of the contract, casing independent.
 * @param {*} network - The network. You can use network id or name.
 */
function getDeployment(contract, network) {
  // replace dots with underscores controllerV1.1 -> controllerV1_1
  const contractName = contract.toLowerCase().replace(".", "_");
  const networkName = typeof network === "number" ? networkMap[network] : network.toLowerCase();

  if (!Object.values(networkMap).includes(networkName)) throw new RangeError("Invalid network");

  // if contract name is controllerlatest return from latestController cache
  if (contractName === "controllerlatest") return controllerLatest[networkName];

  const artifact = contracts[networkName][contractName];
  if (artifact === undefined) throw new RangeError("Invalid contract name");
  return artifact;
}

/**
 * Returns a Controller object based on the address (and network)
 * @param {string} address - Address of Controller you are looking for.
 * @param {*} network - The network. You can use network id or name.
 */
function getControllerByAddress(address, network) {
  const checksumAddress = ethers.utils.getAddress(address);
  const networkName = typeof network === "number" ? networkMap[network] : network.toLowerCase();

  if (!Object.values(networkMap).includes(networkName)) throw new RangeError("Invalid network");

  const fileLookup = {};
  Object.keys(contracts[networkName]).forEach(name => {
    // case sensitive - should only get controllers and controller registry
    if (name.includes("controller")) {
      const artifact = contracts[networkName][name];
      fileLookup[ethers.utils.getAddress(artifact.address)] = artifact; // use checksummed address as key for file lookup
    }
  });

  const controller = fileLookup[checksumAddress];
  if (!controller) {
    throw new Error(`Address did not match any ${networkName} deployments`);
  }
  return controller;
}

module.exports = {
  getDeployment,
  getControllerByAddress,
};
