const { labelhash } = require("@ensdomains/ensjs");

const ReverseRegistrar = require("@ensdomains/ens-contracts/artifacts/contracts/registry/ReverseRegistrar.sol/ReverseRegistrar.json");

module.exports = async ({ deployments, getChainId, getNamedAccounts, ethers }) => {
  const { deploy } = deployments;
  const { gnosisDeployer, ensDeployer, ensHolder } = await getNamedAccounts();
  const signer = ethers.provider.getSigner(ensDeployer);

  const { HashZero, AddressZero } = ethers.constants;

  const network = await getChainId();

  // if not local deployment don't deploy dependencies
  if (network !== "31337") return;

  // deploy gnosis dependencies
  await deploy("GnosisSafe", {
    from: gnosisDeployer,
    gasLimit: 8000000,
    args: [],
  });

  await deploy("GnosisSafeProxyFactory", {
    from: gnosisDeployer,
    gasLimit: 8000000,
  });

  await deploy("CompatibilityFallbackHandler", {
    from: gnosisDeployer,
    gasLimit: 8000000,
  });

  // deploy ens dependencies
  const { address: ensRegistryAddress } = await deploy("ENSRegistry", {
    from: ensDeployer,
    gasLimit: 4000000,
    args: [],
  });

  await deploy("PublicResolver", {
    from: ensDeployer,
    gasLimit: 4000000,
    args: [ensRegistryAddress, AddressZero],
  });

  const { address: reverseResolverAddress } = await deploy("DefaultReverseResolver", {
    from: ensDeployer,
    gasLimit: 4000000,
    args: [ensRegistryAddress],
  });

  const { address: reverseRegistrarAddress } = await deploy("ReverseRegistrar", {
    contract: {
      abi: ReverseRegistrar.abi,
      bytecode: ReverseRegistrar.bytecode,
    },
    from: ensDeployer,
    gasLimit: 4000000,
    args: [ensRegistryAddress, reverseResolverAddress],
  });

  const ensRegistry = await ethers.getContract("ENSRegistry", signer);
  // // setup reverse
  await ensRegistry.setSubnodeOwner(HashZero, labelhash("reverse"), ensDeployer);
  await ensRegistry.setSubnodeOwner(ethers.utils.namehash("reverse"), labelhash("addr"), reverseRegistrarAddress);
  // setup root
  await ensRegistry.setSubnodeOwner(HashZero, labelhash("eth"), ensDeployer);
  // setup pod
  await ensRegistry.setSubnodeOwner(ethers.utils.namehash("eth"), labelhash("pod"), ensHolder);
};

module.exports.tags = ["Dependency"];
