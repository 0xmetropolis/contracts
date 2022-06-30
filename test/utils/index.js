const { ethers } = require("ethers");
const GnosisSafe = require("@gnosis.pm/safe-contracts/build/artifacts/contracts/GnosisSafe.sol/GnosisSafe.json");

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

module.exports = { getPreviousModule };
