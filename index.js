/* eslint-disable global-require */
/* eslint-disable camelcase */
const { ethers } = require("ethers");

const networkMap = {
  1: "mainnet",
  4: "rinkeby",
  5: "goerli",
};

const contracts = {
  rinkeby: {
    podensregistrar: require("./deployments/rinkeby/PodEnsRegistrar.json"),
    controllerregistry: require("./deployments/rinkeby/ControllerRegistry.json"),
    invitetoken: require("./deployments/rinkeby/InviteToken.json"),
    membertoken: require("./deployments/rinkeby/MemberToken.json"),
    controller: require("./deployments/rinkeby/Controller.json"),
    controllerv1: require("./deployments/rinkeby/ControllerV1.json"),
    multicreatev1: require("./deployments/rinkeby/MultiCreateV1.json"),
    controllerv1_1: require("./deployments/rinkeby/ControllerV1.1.json"),
    controllerv1_2: require("./deployments/rinkeby/ControllerV1.2.json"),
    controllerv1_3: require("./deployments/rinkeby/ControllerV1.3.json"),
    controllerv1_4: require("./deployments/rinkeby/ControllerV1.4.json"),
  },
  goerli: {
    podensregistrar: require("./deployments/goerli/PodEnsRegistrar.json"),
    controllerregistry: require("./deployments/goerli/ControllerRegistry.json"),
    invitetoken: require("./deployments/goerli/InviteToken.json"),
    membertoken: require("./deployments/goerli/MemberToken.json"),
    multicreatev1: require("./deployments/goerli/MultiCreateV1.json"),
    controllerv1_4: require("./deployments/goerli/ControllerV1.4.json"),
  },
  mainnet: {
    podensregistrar: require("./deployments/mainnet/PodEnsRegistrar.json"),
    controllerregistry: require("./deployments/mainnet/ControllerRegistry.json"),
    invitetoken: require("./deployments/mainnet/InviteToken.json"),
    membertoken: require("./deployments/mainnet/MemberToken.json"),
    controller: require("./deployments/mainnet/Controller.json"),
    multicreatev1: require("./deployments/mainnet/MultiCreateV1.json"),
    controllerv1: require("./deployments/mainnet/ControllerV1.json"),
    controllerv1_1: require("./deployments/mainnet/ControllerV1.1.json"),
    controllerv1_2: require("./deployments/mainnet/ControllerV1.2.json"),
    controllerv1_3: require("./deployments/mainnet/ControllerV1.3.json"),
    controllerv1_4: require("./deployments/mainnet/ControllerV1.4.json"),
  },
};

const addressToVersion = {
  rinkeby: {},
  mainnet: {},
  goerli: {},
};

// Populate addressMaps
Object.keys(addressToVersion).forEach(network => {
  Object.keys(contracts[network]).forEach(contract => {
    // Filter everything that's not a controller, and also controller registry.
    if (!contract.startsWith("controllerv")) return;
    // Grab only the version, replace the underscore with a dot.
    const version = contract.replace(/controller/, "").replace("_", ".");
    addressToVersion[network][contracts[network][contract].address] = version;
  });
});

const controllerLatest = {
  rinkeby: require("./deployments/rinkeby/ControllerV1.4.json"),
  mainnet: require("./deployments/mainnet/ControllerV1.4.json"),
  goerli: require("./deployments/goerli/ControllerV1.4.json"),
};

/**
 * Accepts networks as either a number or a name and normalizes to a name.
 * @param {*} network
 * @returns string - network
 */
function getNetworkName(network) {
  return typeof network === "number" ? networkMap[network] : network.toLowerCase();
}

/**
 * Gets the artifact of contract based on contract name string and network
 * @param {string} contractName - The name of the contract, casing independent.
 * @param {*} network - The network. You can use network id or name.
 */
function getDeployment(contract, network) {
  // replace dots with underscores controllerV1.1 -> controllerV1_1
  const contractName = contract.toLowerCase().replace(".", "_");
  const networkName = getNetworkName(network);

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
  const networkName = getNetworkName(network);

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

function getControllerVersionByAddress(address, network) {
  const networkName = getNetworkName(network);
  const version = addressToVersion[networkName][address];
  if (!version) throw new Error(`Provided address was not a controller on ${networkName}`);
  return version;
}

module.exports = {
  getDeployment,
  getControllerByAddress,
  getControllerVersionByAddress,
};
