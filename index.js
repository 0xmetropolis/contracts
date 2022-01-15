const RinkebyController = require("./deployments/rinkeby/Controller.json");
const RinkebyControllerV1 = require("./deployments/rinkeby/ControllerV1.json");
const RinkebyControllerRegistry = require("./deployments/rinkeby/ControllerRegistry.json");
const RinkebyMemberToken = require("./deployments/rinkeby/MemberToken.json");
const RinkebyPodEnsRegistrar = require("./deployments/rinkeby/PodEnsRegistrar.json");
const RinkebyInviteToken = require("./deployments/rinkeby/InviteToken.json");
const MainnetController = require("./deployments/mainnet/Controller.json");
const MainnetControllerV1 = require("./deployments/mainnet/ControllerV1.json");
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
    controller: RinkebyController,
    controllerv1: RinkebyControllerV1,
    controllerregistry: RinkebyControllerRegistry,
    membertoken: RinkebyMemberToken,
    podensregistrar: RinkebyPodEnsRegistrar,
    invitetoken: RinkebyInviteToken,
  },
  mainnet: {
    controller: MainnetController,
    controllerv1: MainnetControllerV1,
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
  const networkName = typeof network === "number" ? networkMap[network] : network.toLowerCase();
  if (networkName === "rinkeby") {
    if (address === RinkebyController.address) return RinkebyController;
    if (address === RinkebyControllerV1.address) return RinkebyControllerV1;
    throw new Error("Address did not match any rinkeby deployments");
  }
  if (networkName === "mainnet") {
    if (address === MainnetController.address) return MainnetController;
    if (address === MainnetControllerV1.address) return MainnetControllerV1;
    throw new Error("Address did not match any mainnet deployments");
  }
  throw new Error("Network not found, currently only support rinkeby and mainnet");
}

module.exports = {
  getDeployment,
  getControllerByAddress,
};
