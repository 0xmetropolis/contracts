module.exports = async ({ deployments, getChainId, getNamedAccounts }) => {
  const { deploy } = deployments;
  const { gnosisDeployer } = await getNamedAccounts();

  const network = await getChainId();

  // if not local deployment don't deploy dependencies
  if (network !== "31337") return;

  // deploy ens dependencies
  await deploy("GnosisSafe", {
    from: gnosisDeployer,
    gasLimit: 8000000,
    args: [],
  });

  await deploy("GnosisSafeProxyFactory", {
    from: gnosisDeployer,
    gasLimit: 8000000,
  });
};

module.exports.tags = ["Dependency"];
