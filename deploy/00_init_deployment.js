const { getSafeSingletonDeployment, getProxyFactoryDeployment } = require("@gnosis.pm/safe-deployments");

module.exports = async ({ deployments, getChainId, getNamedAccounts, ethers }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const signer = ethers.provider.getSigner(deployer);

  const network = await getChainId();

  // Rinkeby network ID is 4
  const gnosisSafe = getSafeSingletonDeployment({ network });
  const { defaultAddress: gnosisSafeAddress } = gnosisSafe;
  const proxyFactory = getProxyFactoryDeployment({ network });
  const { defaultAddress: proxyFactoryAddress } = proxyFactory;

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

  const { address: safeTellerAddress } = await deploy("SafeTeller", {
    from: deployer,
    gasLimit: 4000000,
    args: [proxyFactoryAddress, gnosisSafeAddress],
  });

  const { address: ruleManagerAddress } = await deploy("RuleManager", {
    from: deployer,
    gasLimit: 4000000,
    args: [],
  });

  const { address: controllerAddress } = await deploy("Controller", {
    from: deployer,
    gasLimit: 4000000,
    args: [memberTokenAddress, ruleManagerAddress, safeTellerAddress, controllerRegistryAddress],
  });

  const controllerRegistry = await ethers.getContractAt("ControllerRegistry", controllerRegistryAddress, signer);
  const safeTeller = await ethers.getContractAt("SafeTeller", safeTellerAddress, signer);

  await controllerRegistry.registerController(controllerAddress);
  await safeTeller.updateController(controllerAddress);
};
