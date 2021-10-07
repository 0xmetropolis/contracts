const { expect, use } = require("chai");
const { waffle, ethers, deployments, getNamedAccounts } = require("hardhat");
const { default: ENS, labelhash } = require("@ensdomains/ensjs");

const { provider, solidity } = waffle;

use(solidity);

describe("registrar test", () => {
  const [mockController, safe, alice] = provider.getWallets();

  let ensHolderAddress;

  let ensRegistry;
  let podEnsRegistrar;
  let controllerRegistry;

  let ensReverseRegistrar;
  let ens;

  async function setup() {
    await deployments.fixture(["Base"]);
    const { deployer, ensHolder } = await getNamedAccounts();
    ensHolderAddress = ensHolder;

    ensRegistry = await ethers.getContract("ENSRegistry", ensHolder);
    podEnsRegistrar = await ethers.getContract("PodENSRegistrar", deployer);
    controllerRegistry = await ethers.getContract("ControllerRegistry", deployer);

    ensReverseRegistrar = await ethers.getContract("ReverseRegistrar", alice);

    await controllerRegistry.registerController(mockController.address);

    ens = new ENS({ provider, ensAddress: ensRegistry.address });
  }

  before(async () => {
    await setup();
  });

  describe("when setting up PodENS registrar", () => {
    it("should be able to set reverse resolver name", async () => {
      expect(await ensRegistry.owner(ethers.utils.namehash("addr.reverse"))).to.equal(ensReverseRegistrar.address);
      await ensReverseRegistrar.setName("alice.eth");
      expect(await ens.getName(alice.address)).to.deep.equal({ name: "alice.eth" });
    });

    it("should approve registrar in ENSRegistry", async () => {
      await ensRegistry.setApprovalForAll(podEnsRegistrar.address, true);

      expect(await ensRegistry.owner(ethers.utils.namehash("pod.eth"))).to.equal(ensHolderAddress);
      expect(await ensRegistry.isApprovedForAll(ensHolderAddress, podEnsRegistrar.address)).to.equal(true);
    });
  });

  describe("when registering a subdomain", () => {
    it("should update owner and address", async () => {
      await podEnsRegistrar.connect(mockController).registerPod(labelhash("test"), safe.address);

      expect(await ens.name("test.pod.eth").getOwner()).to.equal(podEnsRegistrar.address);
      expect(await ens.name("test.pod.eth").getAddress()).to.equal(safe.address);
    });

    it("should revert if it is registered again", async () => {
      await expect(podEnsRegistrar.connect(alice).registerPod(labelhash("test"), safe.address)).to.be.reverted;
    });

    it("should let the admin change text", async () => {
      await podEnsRegistrar.setText(ethers.utils.namehash("test.pod.eth"), "email", "test@email");

      expect(await ens.name("test.pod.eth").getText("email")).to.equal("test@email");
    });

    it("should let the admin change owner", async () => {
      await podEnsRegistrar.register(labelhash("test"), ensHolderAddress);

      expect(await ens.name("test.pod.eth").getOwner()).to.equal(ensHolderAddress);
    });

    it("should revert if called by invalid controller", async () => {
      await expect(podEnsRegistrar.connect(alice).registerPod(labelhash("test1"), safe.address)).to.be.reverted;
    });
  });
});
