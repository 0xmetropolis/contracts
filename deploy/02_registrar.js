const { getEnsAddress } = require("@ensdomains/ensjs");
const { ENSRegistry } = require("@ensdomains/ens-contracts");

module.exports = async ({ deployments, getChainId, getNamedAccounts, ethers }) => {
  const { deploy } = deployments;
  const { deployer, ensHolder } = await getNamedAccounts();
  const ensHolderSigner = ethers.provider.getSigner(ensHolder);

  // Mainnet network ID is 1
  // Rinkeby network ID is 4
  // Localhost network ID is 31337
  const network = await getChainId();

  const TLD = {
    1: "pod.xyz",
    4: "pod.eth",
    31337: "pod.eth",
  };

  // ENS contracts.
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
  const ensRegistryAddress =
    network === "31337" ? (await deployments.get("ENSRegistry")).address : getEnsAddress(network);
  const ensReverseRegistrar =
    network === "31337" ? (await deployments.get("ReverseRegistrar")).address : ens.reverseRegistrar[network];
  const ensResolver =
    network === "31337" ? (await deployments.get("PublicResolver")).address : ens.publicResolver[network];

  // Our contracts
  const controllerRegistryAddress = (await deployments.get("ControllerRegistry")).address;
  const inviteToken = (await deployments.get("InviteToken")).address;

  const { address: podEnsRegistrarAddress, newlyDeployed } = await deploy("PodEnsRegistrar", {
    from: deployer,
    gasLimit: 4000000,
    args: [
      ensRegistryAddress,
      ensResolver,
      ensReverseRegistrar,
      controllerRegistryAddress,
      ethers.utils.namehash(TLD[network]),
      inviteToken,
    ],
    log: true,
    skipIfAlreadyDeployed: true,
  });

  if (newlyDeployed) {
    const ensRegistry = new ethers.Contract(ensRegistryAddress, ENSRegistry, ensHolderSigner);
    // approve podENSRegistry to make pod.eth changes on behalf of ensHolder
    await ensRegistry.setApprovalForAll(podEnsRegistrarAddress, true);
  }
};

module.exports.tags = ["Registrar"];
module.exports.dependencies = ["Base"];
