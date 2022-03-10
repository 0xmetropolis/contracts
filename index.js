/* eslint-disable camelcase */
const { ethers } = require("ethers");
// controllers
const RinkebyController = require("./deployments/rinkeby/Controller.json");
const RinkebyControllerV1 = require("./deployments/rinkeby/ControllerV1.json");
const RinkebyControllerV1_1 = require("./deployments/rinkeby/ControllerV1.1.json");
//
const RinkebyControllerRegistry = require("./deployments/rinkeby/ControllerRegistry.json");
const RinkebyMemberToken = require("./deployments/rinkeby/MemberToken.json");
const RinkebyPodEnsRegistrar = require("./deployments/rinkeby/PodEnsRegistrar.json");
const RinkebyInviteToken = require("./deployments/rinkeby/InviteToken.json");
// controllers
const MainnetController = require("./deployments/mainnet/Controller.json");
const MainnetControllerV1 = require("./deployments/mainnet/ControllerV1.json");
const MainnetControllerV1_1 = require("./deployments/mainnet/ControllerV1.1.json");
//
const MainnetControllerRegistry = require("./deployments/mainnet/ControllerRegistry.json");
const MainnetMemberToken = require("./deployments/mainnet/MemberToken.json");
const MainnetPodEnsRegistrar = require("./deployments/mainnet/PodEnsRegistrar.json");
const MainnetInviteToken = require("./deployments/mainnet/InviteToken.json");

const networkMap = {
  1: "mainnet",
  4: "rinkeby",
};

const deployments = {
  rinkeby: {
    // controllers
    controller: RinkebyController,
    controllerv1: RinkebyControllerV1,
    controllerv1_1: RinkebyControllerV1_1,
    // latest controller
    controllerlatest: RinkebyControllerV1_1,
    //
    controllerregistry: RinkebyControllerRegistry,
    membertoken: RinkebyMemberToken,
    podensregistrar: RinkebyPodEnsRegistrar,
    invitetoken: RinkebyInviteToken,
  },
  mainnet: {
    // controllers
    controller: MainnetController,
    controllerv1: MainnetControllerV1,
    controllerv1_1: MainnetControllerV1_1,
    // latest controller
    controllerlatest: MainnetControllerV1_1,
    //
    controllerregistry: MainnetControllerRegistry,
    membertoken: MainnetMemberToken,
    podensregistrar: MainnetPodEnsRegistrar,
    invitetoken: MainnetInviteToken,
  },
};

/**
 *
 * @param {string} contractName - The name of the contract, casing independent.
 * @param {*} network - The network. You can use network id or name.
 */
function getDeployment(contract, network) {
  const contractName = contract.toLowerCase();
  const networkName = typeof network === "number" ? networkMap[network] : network.toLowerCase();

  const networkObject = deployments[networkName];
  if (!networkObject) throw new RangeError("Invalid network");

  const contractObject = networkObject[contractName];
  if (!contractObject) throw new RangeError("Invalid contract name");

  return contractObject;
}

/**
 * Returns a Controller object based on the address (and network)
 * @param {string} address - Address of Controller you are looking for.
 * @param {*} network - The network. You can use network id or name.
 */
function getControllerByAddress(address, network) {
  const checksumAddress = ethers.utils.getAddress(address);
  const networkName = typeof network === "number" ? networkMap[network] : network.toLowerCase();
  if (networkName === "rinkeby") {
    if (checksumAddress === ethers.utils.getAddress(RinkebyController.address)) return RinkebyController;
    if (checksumAddress === ethers.utils.getAddress(RinkebyControllerV1.address)) return RinkebyControllerV1;
    if (checksumAddress === ethers.utils.getAddress(RinkebyControllerV1_1.address)) return RinkebyControllerV1_1;
    throw new Error("Address did not match any rinkeby deployments");
  }
  if (networkName === "mainnet") {
    if (checksumAddress === ethers.utils.getAddress(MainnetController.address)) return MainnetController;
    if (checksumAddress === ethers.utils.getAddress(MainnetControllerV1.address)) return MainnetControllerV1;
    if (checksumAddress === ethers.utils.getAddress(MainnetControllerV1_1.address)) return MainnetControllerV1_1;
    throw new Error("Address did not match any mainnet deployments");
  }
  throw new Error("Network not found, currently only support rinkeby and mainnet");
}

module.exports = {
  getDeployment,
  getControllerByAddress,
};
