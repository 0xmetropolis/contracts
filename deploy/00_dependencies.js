const { labelhash } = require("@ensdomains/ensjs");

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

  const ensRegistry = await ethers.getContract("ENSRegistry", signer);
  // setup root
  await ensRegistry.setSubnodeOwner(HashZero, labelhash("eth"), ensDeployer);
  // setup pod
  await ensRegistry.setSubnodeOwner(ethers.utils.namehash("eth"), labelhash("pod"), ensHolder);
};

module.exports.tags = ["Dependency"];
