require("@nomiclabs/hardhat-waffle");
require("hardhat-gas-reporter");

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async () => {
  const accounts = await ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: "0.7.4",
  gasReporter: {
    currency: "USD",
    gasPrice: 150,
    coinmarketcap: "89cb5fbd-4c95-4879-a48a-ef63a5939d49",
  },
  networks: {
    hardhat: {
      gas: 12000000,
      blockGasLimit: 0xbebc20,
      allowUnlimitedContractSize: true,
      timeout: 1800000000,
    },
  },
};
