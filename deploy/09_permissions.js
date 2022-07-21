module.exports = async ({ deployments, getNamedAccounts }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("Permissions", {
    from: deployer,
    gasLimit: 8000000,
    args: [],
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

module.exports.tags = ["Permissions"];
module.exports.dependencies = ["Base"];
