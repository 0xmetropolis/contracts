/* eslint-disable camelcase */
const { expect } = require("chai");
const { getDeployment, getControllerByAddress } = require("..");
const RinkebyController = require("../deployments/rinkeby/Controller.json");
const RinkebyControllerV1_1 = require("../deployments/rinkeby/ControllerV1.1.json");
const MainnetController = require("../deployments/mainnet/Controller.json");

describe("Get Deployment", () => {
  it("should throw if the network is invalid", () => {
    expect(() => {
      getDeployment("Controller", "ropsten");
    }).to.throw("Invalid network");
  });

  it("should throw if the contract is invalid", () => {
    expect(() => getDeployment("wrongcontract", "rinkeby")).to.throw("Invalid contract name");
  });

  it("should be able to find contracts regardless of casing", () => {
    expect(getDeployment("ConTroller", "rinkeby")).to.equal(RinkebyController);
  });

  it("should be able to find mainnet contracts", () => {
    expect(getDeployment("ConTroller", "Mainnet")).to.equal(MainnetController);
  });

  it("should be able to find contracts using network ID instead of name", () => {
    expect(getDeployment("ConTroller", 4)).to.equal(RinkebyController);
  });

  it("should be able to fetch Controllers by address", () => {
    // Original Controller
    expect(getControllerByAddress("0xe804300793bb60F71242A5dE7eca7Cbb844Ae3BA", "rinkeby")).to.equal(RinkebyController);
    // Original Controller, no checksum
    expect(getControllerByAddress("0xe804300793bb60f71242a5de7eca7cbb844ae3ba", "rinkeby")).to.equal(RinkebyController);
    // Controller V1_1
    expect(getControllerByAddress("0x5BC9beb5B7E359Ec95e001536d18f6C908570401", "rinkeby")).to.equal(
      RinkebyControllerV1_1,
    );
    // Controller V1_1, no checksum.
    expect(getControllerByAddress("0x5bc9beb5b7e359ec95e001536d18f6c908570401", "rinkeby")).to.equal(
      RinkebyControllerV1_1,
    );
  });
});
