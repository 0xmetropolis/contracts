require("@nomiclabs/hardhat-waffle");
require("hardhat-gas-reporter");

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
    rinkeby: {
      url: `https://rinkeby.infura.io/v3/69ecf3b10bc24c6a972972666fe950c8`,
      // Add private key to this array as a string.
      accounts: [],
    },
  },
};
