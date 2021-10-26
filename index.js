const RinkebyController = require("./deployments/rinkeby/Controller.json");
const RinkebyControllerRegistry = require("./deployments/rinkeby/ControllerRegistry.json");
const RinkebyMemberToken = require("./deployments/rinkeby/MemberToken.json");
const RinkebyPodEnsRegistrar = require("./deployments/rinkeby/PodEnsRegistrar.json");
const RinkebyInviteToken = require("./deployments/rinkeby/InviteToken.json");
const MainnetController = require("./deployments/mainnet/Controller.json");
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
    controllerregistry: RinkebyControllerRegistry,
    membertoken: RinkebyMemberToken,
    podensregistrar: RinkebyPodEnsRegistrar,
    invitetoken: RinkebyInviteToken,
  },
  mainnet: {
    controller: MainnetController,
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

module.exports = {
  getDeployment,
};
