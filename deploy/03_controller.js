const Controller = require("../deployments/mainnet/Controller.json");
const { getGnosisAddresses } = require("../utils/dependencyManager");

module.exports = async ({ deployments, getChainId, getNamedAccounts, ethers }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const signer = ethers.provider.getSigner(deployer);

  // Mainnet network ID is 1
  // Rinkeby network ID is 4
  // Localhost network ID is 31337
  const network = await getChainId();

  // Gnosis contracts
  const { proxyFactoryAddress, gnosisSafeSingletonAddress } = await getGnosisAddresses(network, deployments);

  // Our contracts
  const memberTokenAddress = (await deployments.get("MemberToken")).address;
  const controllerRegistryAddress = (await deployments.get("ControllerRegistry")).address;
  const podEnsRegistrarAddress = (await deployments.get("PodEnsRegistrar")).address;

  const { address: controllerAddress, newlyDeployed } = await deploy("Controller", {
    contract: {
      abi: Controller.abi,
      bytecode: Controller.bytecode,
    },
    from: deployer,
    gasLimit: 8000000,
    args: [
      memberTokenAddress,
      controllerRegistryAddress,
      proxyFactoryAddress,
      gnosisSafeSingletonAddress,
      podEnsRegistrarAddress,
    ],
    log: true,
    skipIfAlreadyDeployed: true,
  });

  if (newlyDeployed) {
    const controllerRegistry = await ethers.getContractAt("ControllerRegistry", controllerRegistryAddress, signer);

    await controllerRegistry.registerController(controllerAddress);
  }
};

module.exports.tags = ["Controller"];
module.exports.dependencies = ["Registrar"];
