const { ENSRegistry } = require("@ensdomains/ens-contracts");
const { getEnsAddresses } = require("../utils/dependencyManager");

module.exports = async ({ deployments, getChainId, getNamedAccounts, ethers }) => {
  const { deploy } = deployments;
  const { deployer, ensHolder } = await getNamedAccounts();
  const ensHolderSigner = ethers.provider.getSigner(ensHolder);

  // Mainnet network ID is 1
  // Rinkeby network ID is 4
  // Localhost network ID is 31337
  const network = await getChainId();
  let TLD;
  if (network === 1) {
    TLD = "pod.xyz";
  } else {
    TLD = "pod.eth";
  }

  // ENS contracts.
  const { reverseRegistrarAddress, publicResolverAddress, registryAddress } = await getEnsAddresses(
    network,
    deployments,
  );

  // Our contracts
  const controllerRegistryAddress = (await deployments.get("ControllerRegistry")).address;
  const inviteToken = (await deployments.get("InviteToken")).address;

  const { address: podEnsRegistrarAddress, newlyDeployed } = await deploy("PodEnsRegistrar", {
    from: deployer,
    gasLimit: 4000000,
    args: [
      registryAddress,
      publicResolverAddress,
      reverseRegistrarAddress,
      controllerRegistryAddress,
      ethers.utils.namehash(TLD),
      inviteToken,
    ],
    log: true,
    skipIfAlreadyDeployed: true,
  });

  if (newlyDeployed && network === 31337) {
    const ensRegistry = new ethers.Contract(registryAddress, ENSRegistry, ensHolderSigner);
    // approve podENSRegistry to make pod.eth changes on behalf of ensHolder
    await ensRegistry.setApprovalForAll(podEnsRegistrarAddress, true);
  }
};

module.exports.tags = ["Registrar"];
module.exports.dependencies = ["Base"];
