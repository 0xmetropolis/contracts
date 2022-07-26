const {
  getSafeSingletonDeployment,
  getProxyFactoryDeployment,
  getCompatibilityFallbackHandlerDeployment,
  getDefaultCallbackHandlerDeployment,
  getMultiSendDeployment,
} = require("@gnosis.pm/safe-deployments");
const { getEnsAddress } = require("@ensdomains/ensjs");
const { ethers } = require("ethers");

const getEnsAddresses = async (network, deployments) => {
  if (!network || !deployments) throw new Error("getEnsAddresses: network and deployments are required");

  const reverseRegistrar = {
    1: "0x084b1c3C81545d370f3634392De611CaaBFf8148",
    4: "0x6F628b68b30Dc3c17f345c9dbBb1E483c2b7aE5c",
    31337:
      network === "31337" ? (await deployments.get("MockEnsReverseRegistrar")).address : ethers.constants.AddressZero,
  };
  const publicResolver = {
    1: "0x4976fb03C32e5B8cfe2b6cCB31c09Ba78EBaBa41",
    4: "0xf6305c19e814d2a75429Fd637d01F7ee0E77d615",
    31337: network === "31337" ? (await deployments.get("MockEnsResolver")).address : ethers.constants.AddressZero,
  };
  const registry = {
    1: getEnsAddress(1),
    4: getEnsAddress(4),
    31337: network === "31337" ? (await deployments.get("MockEns")).address : ethers.constants.AddressZero,
  };
  return {
    reverseRegistrarAddress: reverseRegistrar[network],
    publicResolverAddress: publicResolver[network],
    registryAddress: registry[network],
  };
};

const getGnosisAddresses = async (network, deployments) => {
  if (!network || !deployments) throw new Error("getGnosisAddresses: network and deployments are required");

  const proxyFactory = {
    1: getProxyFactoryDeployment({ network: 1 }).defaultAddress,
    4: getProxyFactoryDeployment({ network: 4 }).defaultAddress,
    31337:
      network === "31337" ? (await deployments.get("GnosisSafeProxyFactory")).address : ethers.constants.AddressZero,
  };

  const gnosisSafe = {
    1: getSafeSingletonDeployment({ network: 1 }).defaultAddress,
    4: getSafeSingletonDeployment({ network: 4 }).defaultAddress,
    31337: network === "31337" ? (await deployments.get("GnosisSafe")).address : ethers.constants.AddressZero,
  };

  const fallbackHandler = {
    1: getCompatibilityFallbackHandlerDeployment({ network: 1 }).defaultAddress,
    4: getCompatibilityFallbackHandlerDeployment({ network: 4 }).defaultAddress,
    31337:
      network === "31337"
        ? (await deployments.get("CompatibilityFallbackHandler")).address
        : ethers.constants.AddressZero,
  };

  const unSafeCallbackHandler = {
    1: getDefaultCallbackHandlerDeployment({ network: 1 }).defaultAddress,
    4: getDefaultCallbackHandlerDeployment({ network: 4 }).defaultAddress,
    31337:
      network === "31337" ? (await deployments.get("DefaultCallbackHandler")).address : ethers.constants.AddressZero,
  };

  const multiSend = {
    1: getMultiSendDeployment({ network: 1 }).defaultAddress,
    4: getMultiSendDeployment({ network: 4 }).defaultAddress,
    31337: network === "31337" ? (await deployments.get("MultiSend")).address : ethers.constants.AddressZero,
  };

  return {
    proxyFactoryAddress: proxyFactory[network],
    gnosisSafeSingletonAddress: gnosisSafe[network],
    fallbackHandlerAddress: fallbackHandler[network],
    unsafeCallbackHandlerAddress: unSafeCallbackHandler[network],
    multiSendAddress: multiSend[network],
  };
};

module.exports = {
  getEnsAddresses,
  getGnosisAddresses,
};
