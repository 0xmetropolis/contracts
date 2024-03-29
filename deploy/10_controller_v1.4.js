const {
  getSafeSingletonDeployment,
  getProxyFactoryDeployment,
  getCompatibilityFallbackHandlerDeployment,
} = require("@gnosis.pm/safe-deployments");

module.exports = async ({ deployments, getChainId, getNamedAccounts, ethers }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const signer = ethers.provider.getSigner(deployer);

  // Mainnet network ID is 1
  // Rinkeby network ID is 4
  // Localhost network ID is 31337
  const network = await getChainId();

  // Gnosis contracts
  const proxyFactoryAddress =
    network === "31337"
      ? (await deployments.get("GnosisSafeProxyFactory")).address
      : getProxyFactoryDeployment({ network }).defaultAddress;

  const gnosisSafeAddress =
    network === "31337"
      ? (await deployments.get("GnosisSafe")).address
      : getSafeSingletonDeployment({ network }).defaultAddress;

  const fallbackHandlerAddress =
    network === "31337"
      ? (await deployments.get("CompatibilityFallbackHandler")).address
      : getCompatibilityFallbackHandlerDeployment({ network }).defaultAddress;

  // Our contracts
  const memberTokenAddress = (await deployments.get("MemberToken")).address;
  const controllerRegistryAddress = (await deployments.get("ControllerRegistry")).address;
  const podEnsRegistrarAddress = (await deployments.get("PodEnsRegistrar")).address;

  const { address: controllerAddress, newlyDeployed } = await deploy("ControllerV1.4", {
    contract: "ControllerV1",
    from: deployer,
    gasLimit: 8000000,
    args: [
      deployer,
      memberTokenAddress,
      controllerRegistryAddress,
      proxyFactoryAddress,
      gnosisSafeAddress,
      podEnsRegistrarAddress,
      fallbackHandlerAddress,
    ],
    log: true,
    skipIfAlreadyDeployed: false,
    deterministicDeployment: "0x0000000000000000000000000000000000000000000000000000000000000001",
  });

  if (newlyDeployed) {
    const controllerRegistry = await ethers.getContractAt("ControllerRegistry", controllerRegistryAddress, signer);

    await controllerRegistry.registerController(controllerAddress);
  }
};

module.exports.tags = ["ControllerV1.4"];
module.exports.dependencies = ["Registrar"];
