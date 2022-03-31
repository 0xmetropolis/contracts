/* eslint-disable camelcase */
const { ethers } = require("ethers");
const fs = require("fs");

// controllers
const rinkebyController = require("./deployments/rinkeby/ControllerV1.2.json");
const mainnetController = require("./deployments/mainnet/ControllerV1.1.json");

const networkMap = {
  1: "mainnet",
  4: "rinkeby",
};

const controllerLatest = {
  rinkeby: rinkebyController,
  mainnet: mainnetController,
};

/**
 *
 * @param {string} contractName - The name of the contract, casing independent.
 * @param {*} network - The network. You can use network id or name.
 */
function getDeployment(contract, network) {
  // replace underscores with dots controllerV1_1 -> controllerV1.1
  const contractName = contract.toLowerCase().replace("_", ".");
  const networkName = typeof network === "number" ? networkMap[network] : network.toLowerCase();

  if (!Object.values(networkMap).includes(networkName)) throw new RangeError("Invalid network");

  // if contract name is controllerlatest return from latestController cache
  if (contractName === "controllerlatest") return controllerLatest[networkName];

  const fileNameLookup = {};
  fs.readdirSync(`./deployments/${networkName}`).forEach(name => {
    const fileName = name.toLowerCase().split(".json")[0]; // get lowercase name w/o file extension
    fileNameLookup[fileName] = name; // use filename as key for file name lookup
  });

  try {
    const artifact = JSON.parse(fs.readFileSync(`./deployments/${networkName}/${fileNameLookup[contractName]}`));
    return artifact;
  } catch (e) {
    throw new RangeError("Invalid contract name");
  }
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
  fs.readdirSync(`./deployments/${networkName}`).forEach(name => {
    // case sensitive - should only get controllers and controller registry
    if (name.includes("Controller")) {
      const artifact = JSON.parse(fs.readFileSync(`./deployments/${networkName}/${name}`));
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
