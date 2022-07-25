module.exports = async ({ deployments, getNamedAccounts }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("PermissionManager", {
    from: deployer,
    gasLimit: 8000000,
    args: [],
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

module.exports.tags = ["PermissionManager"];
module.exports.dependencies = ["Base"];
