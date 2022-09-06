/* eslint-disable camelcase */
const { expect } = require("chai");
const { getDeployment, getControllerByAddress, getControllerVersionByAddress } = require("..");
const RinkebyController = require("../deployments/rinkeby/Controller.json");
const RinkebyControllerV1_1 = require("../deployments/rinkeby/ControllerV1.1.json");
const MainnetController = require("../deployments/mainnet/Controller.json");
const RinkebyMemberToken = require("../deployments/rinkeby/MemberToken.json");

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
    expect(getDeployment("controller", "rinkeby")).to.deep.equal(RinkebyController);
  });
  it("should be able to find memberToken regardless of casing", () => {
    expect(getDeployment("membertoken", "rinkeby")).to.deep.equal(RinkebyMemberToken);
  });

  it("should be able to find contracts with versioning", () => {
    expect(getDeployment("ControllerV1_1", "rinkeby")).to.deep.equal(RinkebyControllerV1_1);
    expect(getDeployment("controllerv1.1", "rinkeby")).to.deep.equal(RinkebyControllerV1_1);
  });

  it("should be able to find mainnet contracts", () => {
    expect(getDeployment("Controller", "Mainnet")).to.deep.equal(MainnetController);
  });

  it("should be able to find contracts using network ID instead of name", () => {
    expect(getDeployment("Controller", 4)).to.deep.equal(RinkebyController);
  });

  it("should be able to find latest controller", () => {
    expect(() => getDeployment("ControllerLatest", 4)).to.not.throw("Invalid contract name");
    expect(getDeployment("ControllerLatest", 4)).to.have.property("abi");
  });

  it("should be able to fetch Controllers by address", () => {
    // Original Controller
    expect(getControllerByAddress("0xe804300793bb60F71242A5dE7eca7Cbb844Ae3BA", "rinkeby")).to.deep.equal(
      RinkebyController,
    );
    // Original Controller, no checksum
    expect(getControllerByAddress("0xe804300793bb60f71242a5de7eca7cbb844ae3ba", "rinkeby")).to.deep.equal(
      RinkebyController,
    );
    // Controller V1_1
    expect(getControllerByAddress("0x5BC9beb5B7E359Ec95e001536d18f6C908570401", "rinkeby")).to.deep.equal(
      RinkebyControllerV1_1,
    );
    // Controller V1_1, no checksum.
    expect(getControllerByAddress("0x5bc9beb5b7e359ec95e001536d18f6c908570401", "rinkeby")).to.deep.equal(
      RinkebyControllerV1_1,
    );
  });
});

describe("Get version from address", () => {
  it("should be able to return a version given an address and a network", () => {
    const version = getControllerVersionByAddress("0x4C98aF741e352C6551BfF9509b3f8ca9Dd4E6397", "mainnet");
    expect(version).to.equal("v1.4");
  });

  it("should throw if given a non-controller address", () => {
    expect(() => {
      getControllerVersionByAddress("notanaddress", "mainnet");
    }).to.throw("Provided address was not a controller");
  });
});
