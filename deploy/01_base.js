const {
  getSafeSingletonDeployment,
  getProxyFactoryDeployment,
  getDefaultCallbackHandlerDeployment,
} = require("@gnosis.pm/safe-deployments");
const { getEnsAddress } = require("@ensdomains/ensjs");
const { ENSRegistry } = require("@ensdomains/ens-contracts");

module.exports = async ({ deployments, getChainId, getNamedAccounts, ethers }) => {
  const { deploy } = deployments;
  const { deployer, ensHolder } = await getNamedAccounts();
  const signer = ethers.provider.getSigner(deployer);
  const ensHolderSigner = ethers.provider.getSigner(ensHolder);

  // Mainnet network ID is 1
  // Rinkeby network ID is 4
  // Localhost network ID is 31337
  const network = await getChainId();

  const ens = {
    reverseRegistrar: {
      1: "0x084b1c3C81545d370f3634392De611CaaBFf8148",
      4: "0x6F628b68b30Dc3c17f345c9dbBb1E483c2b7aE5c",
    },
    publicResolver: {
      1: "0x4976fb03C32e5B8cfe2b6cCB31c09Ba78EBaBa41",
      4: "0xf6305c19e814d2a75429Fd637d01F7ee0E77d615",
    },
  };

  const TLD = {
    1: "pod.xyz",
    4: "pod.eth",
    31337: "pod.eth",
  };

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
      : getDefaultCallbackHandlerDeployment({ network }).defaultAddress;

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
    log: true,
    skipIfAlreadyDeployed: true,
  });

  const { address: inviteTokenAddress } = await deploy("InviteToken", {
    from: deployer,
    gasLimit: 8000000,
    args: [],
    log: true,
    skipIfAlreadyDeployed: true,
  });

  const { address: podEnsRegistrarAddress } = await deploy("PodEnsRegistrar", {
    from: deployer,
    gasLimit: 4000000,
    args: [
      ensRegistryAddress,
      ensResolver,
      ensReverseRegistrar,
      controllerRegistryAddress,
      ethers.utils.namehash(TLD[network]),
      inviteTokenAddress,
    ],
    log: true,
    skipIfAlreadyDeployed: true,
  });

  const nftUrl =
    network === 1
      ? "https://orcaprotocol-nft.vercel.app/assets/{id}.json"
      : "https://orcaprotocol-nft.vercel.app/assets/testnet/{id}.json";
  const { address: memberTokenAddress } = await deploy("MemberToken", {
    from: deployer,
    gasLimit: 8000000,
    args: [controllerRegistryAddress, nftUrl],
    log: true,
    skipIfAlreadyDeployed: true,
  });

  const { address: controllerAddress } = await deploy("Controller", {
    from: deployer,
    gasLimit: 8000000,
    args: [
      memberTokenAddress,
      controllerRegistryAddress,
      proxyFactoryAddress,
      gnosisSafeAddress,
      podEnsRegistrarAddress,
      fallbackHandlerAddress,
    ],
    log: true,
    skipIfAlreadyDeployed: true,
  });

  const controllerRegistry = await ethers.getContractAt("ControllerRegistry", controllerRegistryAddress, signer);

  await controllerRegistry.registerController(controllerAddress);

  const ensRegistry = new ethers.Contract(ensRegistryAddress, ENSRegistry, ensHolderSigner);
  // approve podENSRegistry to make pod.eth changes on behalf of ensHolder
  await ensRegistry.setApprovalForAll(podEnsRegistrarAddress, true);
};

module.exports.tags = ["Base"];
module.exports.dependencies = ["Dependency"];
