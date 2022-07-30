const GnosisSafe = require("@gnosis.pm/safe-contracts/build/artifacts/contracts/GnosisSafe.sol/GnosisSafe.json");
const Safe = require("@gnosis.pm/safe-core-sdk").default;
const { SafeFactory } = require("@gnosis.pm/safe-core-sdk");
const { deployments, ethers } = require("hardhat");
const { default: EthersAdapter } = require("@gnosis.pm/safe-ethers-lib");
const { labelhash } = require("@ensdomains/ensjs");
const { getGnosisAddresses } = require("../../utils/dependencyManager");

/**
 * Gets the previous Controller module from the safe contract.
 * @param safe - Safe address
 * @param oldController - Old controller address
 * @param newController - New controller address
 * @param signer
 * @returns
 */
// eslint-disable-next-line import/prefer-default-export
async function getPreviousModule(safe, module, signer) {
  const safeContract = new ethers.Contract(safe, GnosisSafe.abi, signer);
  const AddressOne = "0x0000000000000000000000000000000000000001";
  // TODO: figure out a better way to traverse the safes
  // I'm not sure why but in the SDK, this is nested in some strange object, hence the .array here vs the web version.
  const temp = await safeContract.getModulesPaginated(AddressOne, 10);
  const safeModules = temp.array ? temp.array : temp;

  const oldIndex = safeModules.indexOf(ethers.utils.getAddress(module));
  const previousModule = safeModules.length === 1 || oldIndex === 0 ? AddressOne : safeModules[oldIndex - 1];

  if (!previousModule) throw new Error("Error parsing old modules");

  return previousModule;
}

// SAFE UTILS

async function createSafeSigner(safeAddress, signer) {
  const { chainId } = await ethers.provider.getNetwork();
  const { multiSendAddress, gnosisSafeSingletonAddress, proxyFactoryAddress } = await getGnosisAddresses(
    chainId,
    deployments,
  );

  return Safe.create({
    ethAdapter: new EthersAdapter({ ethers, signer }),
    safeAddress,
    contractNetworks: {
      [String(chainId)]: {
        multiSendAddress,
        safeMasterCopyAddress: gnosisSafeSingletonAddress,
        safeProxyFactoryAddress: proxyFactoryAddress,
      },
    },
  });
}

async function createSafeWithControllerModule(members, controllerAddress, signer) {
  const { chainId } = await ethers.provider.getNetwork();

  const { multiSendAddress, gnosisSafeSingletonAddress, proxyFactoryAddress } = await getGnosisAddresses(
    chainId,
    deployments,
  );

  const safeFactory = await SafeFactory.create({
    ethAdapter: new EthersAdapter({ ethers, signer }),
    contractNetworks: {
      [String(chainId)]: {
        multiSendAddress,
        safeMasterCopyAddress: gnosisSafeSingletonAddress,
        safeProxyFactoryAddress: proxyFactoryAddress,
      },
    },
  });

  const safeSdk = await safeFactory.deploySafe({ safeAccountConfig: { owners: members, threshold: 1 } });
  const moduleTx = await safeSdk.getEnableModuleTx(controllerAddress);
  const { transactionResponse } = await safeSdk.executeTransaction(moduleTx);
  await transactionResponse.wait();

  return safeSdk;
}

// POD UTILS
const { AddressZero } = ethers.constants;

const THRESHOLD = 1;
const POD_ID = 0;
const IMAGE_URL = "https://orcaprotocol-nft.vercel.app/assets/testnet/00000001";
const TX_OPTIONS = { gasLimit: 4000000 };

const createPodHelper = async (controller, admin) => {
  const [, alice, bob] = await ethers.getSigners();

  controller.createPod(
    [alice.address, bob.address],
    THRESHOLD,
    admin ? admin.address : AddressZero,
    labelhash("test"),
    "test.pod.eth",
    POD_ID,
    IMAGE_URL,
    TX_OPTIONS,
  );
  // query the new gnosis safe
  const safeAddress = await controller.podIdToSafe(POD_ID);
  const ethersSafe = await createSafeSigner(safeAddress, admin || alice);
  const safeContract = new ethers.Contract(safeAddress, GnosisSafe.abi, alice);

  return { safeContract, ethersSafe, POD_ID };
};

const createPodWithSafeHelper = async (controller, admin) => {
  const [, alice, bob] = await ethers.getSigners();
  const ethersSafe = await createSafeWithControllerModule([alice.address, bob.address], controller.address, alice);

  await controller
    .connect(alice)
    .createPodWithSafe(
      admin ? admin.address : AddressZero,
      ethersSafe.getAddress(),
      labelhash("test2"),
      "test2.pod.eth",
      POD_ID,
      IMAGE_URL,
    );
  const safeContract = new ethers.Contract(ethersSafe.getAddress(), GnosisSafe.abi, alice);
  return { safeContract, ethersSafe, POD_ID };
};

module.exports = {
  getPreviousModule,
  createSafeSigner,
  createSafeWithControllerModule,
  createPodHelper,
  createPodWithSafeHelper,
};
