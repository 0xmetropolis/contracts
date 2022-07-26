module.exports = async ({ deployments, getChainId, getNamedAccounts }) => {
  const { deploy } = deployments;
  const { gnosisDeployer, ensDeployer } = await getNamedAccounts();

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

  await deploy("MultiSend", {
    from: gnosisDeployer,
    gasLimit: 8000000,
  });

  // unsafe do not use only for backwards compatibility testing
  await deploy("DefaultCallbackHandler", {
    from: gnosisDeployer,
    gasLimit: 8000000,
  });

  // deploy ens dependencies
  await deploy("MockEns", {
    from: ensDeployer,
    gasLimit: 4000000,
  });

  await deploy("MockEnsResolver", {
    from: ensDeployer,
    gasLimit: 4000000,
  });

  await deploy("MockEnsReverseRegistrar", {
    from: ensDeployer,
    gasLimit: 4000000,
  });
};

module.exports.tags = ["Dependency"];
