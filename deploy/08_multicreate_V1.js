module.exports = async ({ deployments, getNamedAccounts }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const memberTokenAddress = (await deployments.get("MemberToken")).address;

  await deploy("MultiCreateV1", {
    from: deployer,
    gasLimit: 8000000,
    args: [memberTokenAddress],
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

module.exports.tags = ["MultiCreateV1"];
module.exports.dependencies = ["Base"];
