const { expect } = require("chai");
const { getDeployment } = require("..");
const RinkebyController = require("../deployments/rinkeby/Controller.json");
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
});
