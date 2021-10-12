const { getSafeSingletonDeployment, getProxyFactoryDeployment } = require("@gnosis.pm/safe-deployments");
const { getEnsAddress } = require("@ensdomains/ensjs");
const { ENSRegistry } = require("@ensdomains/ens-contracts");

module.exports = async ({ deployments, getChainId, getNamedAccounts, ethers }) => {
  const { deploy } = deployments;
  const { deployer, ensHolder } = await getNamedAccounts();
  const signer = ethers.provider.getSigner(deployer);
  const ensHolderSigner = ethers.provider.getSigner(ensHolder);

  // Rinkeby network ID is 4
  // Localhost network ID is 31337
  const network = await getChainId();

  const ens = {
    reverseRegistrar: {
      4: "0x6F628b68b30Dc3c17f345c9dbBb1E483c2b7aE5c",
    },
    publicResolver: {
      4: "0xf6305c19e814d2a75429Fd637d01F7ee0E77d615",
    },
  };

  const proxyFactoryAddress =
    network === "31337"
      ? (await deployments.get("GnosisSafeProxyFactory")).address
      : getProxyFactoryDeployment({ network }).defaultAddress;

  const gnosisSafeAddress =
    network === "31337"
      ? (await deployments.get("GnosisSafe")).address
      : getSafeSingletonDeployment({ network }).defaultAddress;

  const ensRegistryAddress =
    network === "31337" ? (await deployments.get("ENSRegistry")).address : getEnsAddress(network);

  const ensReverseRegistrar =
    network === "31337" ? (await deployments.get("ReverseRegistrar")).address : ens.reverseRegistrar[network];

  const ensResolver =
    network === "31337" ? (await deployments.get("PublicResolver")).address : ens.publicResolver[network];

  const { address: controllerRegistryAddress } = await deploy("ControllerRegistry", {
    from: deployer,
    gasLimit: 8000000,
    args: [],
  });

  const { address: podENSRegistrarAddress } = await deploy("PodENSRegistrar", {
    from: deployer,
    gasLimit: 4000000,
    args: [
      ensRegistryAddress,
      ensResolver,
      ensReverseRegistrar,
      controllerRegistryAddress,
      ethers.utils.namehash("pod.eth"),
    ],
  });

  const { address: memberTokenAddress } = await deploy("MemberToken", {
    from: deployer,
    gasLimit: 8000000,
    args: [controllerRegistryAddress, "https://orcaprotocol-nft.vercel.app/assets/{id}.json"],
  });

  const { address: controllerAddress } = await deploy("Controller", {
    from: deployer,
    gasLimit: 8000000,
    args: [
      memberTokenAddress,
      controllerRegistryAddress,
      proxyFactoryAddress,
      gnosisSafeAddress,
      podENSRegistrarAddress,
    ],
  });

  const controllerRegistry = await ethers.getContractAt("ControllerRegistry", controllerRegistryAddress, signer);

  await controllerRegistry.registerController(controllerAddress);

  const ensRegistry = new ethers.Contract(ensRegistryAddress, ENSRegistry, ensHolderSigner);
  // approve podENSRegistry to make pod.eth changes on behalf of ensHolder
  await ensRegistry.setApprovalForAll(podENSRegistrarAddress, true);
};

module.exports.tags = ["Base"];
module.exports.dependencies = ["Dependency"];
