const { getSafeSingletonDeployment, getProxyFactoryDeployment } = require("@gnosis.pm/safe-deployments");

module.exports = async ({ deployments, getChainId, getNamedAccounts, ethers }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const signer = ethers.provider.getSigner(deployer);

  // Rinkeby network ID is 4
  // Localhost network ID is 31337
  const network = await getChainId();

  const proxyFactoryAddress =
    network === "31337"
      ? (await deployments.get("GnosisSafeProxyFactory")).address
      : getProxyFactoryDeployment({ network }).defaultAddress;

  const gnosisSafeAddress =
    network === "31337"
      ? (await deployments.get("GnosisSafe")).address
      : getSafeSingletonDeployment({ network }).defaultAddress;

  const { address: controllerRegistryAddress } = await deploy("ControllerRegistry", {
    from: deployer,
    gasLimit: 4000000,
    args: [],
  });

  const { address: memberTokenAddress } = await deploy("MemberToken", {
    from: deployer,
    gasLimit: 4000000,
    args: [controllerRegistryAddress],
  });

  const { address: controllerAddress } = await deploy("Controller", {
    from: deployer,
    gasLimit: 4000000,
    args: [memberTokenAddress, controllerRegistryAddress, proxyFactoryAddress, gnosisSafeAddress],
  });

  const controllerRegistry = await ethers.getContractAt("ControllerRegistry", controllerRegistryAddress, signer);

  await controllerRegistry.registerController(controllerAddress);
};

module.exports.tags = ["Base"];
module.exports.dependencies = ["Dependency"];
