module.exports = async ({ deployments, getChainId, getNamedAccounts }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  // Mainnet network ID is 1
  // Rinkeby network ID is 4
  // Localhost network ID is 31337
  const network = await getChainId();

  const { address: controllerRegistryAddress } = await deploy("ControllerRegistry", {
    from: deployer,
    gasLimit: 8000000,
    args: [],
    log: true,
    skipIfAlreadyDeployed: true,
  });

  await deploy("InviteToken", {
    from: deployer,
    gasLimit: 8000000,
    args: [],
    log: true,
    skipIfAlreadyDeployed: true,
  });

  const nftUrl =
    network === 1
      ? "https://orcaprotocol-nft.vercel.app/assets/{id}.json"
      : "https://orcaprotocol-nft.vercel.app/assets/testnet/{id}.json";
  await deploy("MemberToken", {
    from: deployer,
    gasLimit: 8000000,
    args: [controllerRegistryAddress, nftUrl],
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

module.exports.tags = ["Base"];
module.exports.dependencies = ["Dependency"];
// This ensures that base script will only ever run once.
// module.exports.skip = async () => true;
// module.exports.id = "1";
