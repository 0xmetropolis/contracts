const { expect, use } = require("chai");
const { waffle, ethers, deployments } = require("hardhat");

const InviteToken = require("../artifacts/contracts/InviteToken.sol/InviteToken.json");

const { provider, solidity, deployContract } = waffle;

use(solidity);

describe("Invite Token Test", () => {
  const [admin, minter, burner, alice] = provider.getWallets();
  let minterRole;
  let burnerRole;

  const setup = async () => {
    await deployments.fixture(["Base", "Registrar", "Controller", "ControllerV1"]);
    const inviteToken = await deployContract(admin, InviteToken, []);
    minterRole = inviteToken.MINTER_ROLE();
    burnerRole = inviteToken.BURNER_ROLE();
    await inviteToken.grantRole(minterRole, minter.address);
    await inviteToken.grantRole(burnerRole, burner.address);

    const podEnsRegistrar = await ethers.getContract("PodEnsRegistrar", admin);
    await podEnsRegistrar.setRestrictionState(2); // 2 == open enrollment

    return { inviteToken };
  };

  describe("Roles", () => {
    it("Assigns initial roles", async () => {
      const { inviteToken } = await setup();
      const adminRole = inviteToken.DEFAULT_ADMIN_ROLE();
      expect(await inviteToken.hasRole(adminRole, admin.address)).to.equal(true);
      expect(await inviteToken.hasRole(adminRole, minter.address)).to.equal(false);
    });

    it("Allows admins to assign and revoke roles", async () => {
      const { inviteToken } = await setup();

      const adminRole = inviteToken.DEFAULT_ADMIN_ROLE();
      await inviteToken.grantRole(adminRole, alice.address);
      expect(await inviteToken.hasRole(adminRole, alice.address)).to.equal(true);

      await inviteToken.revokeRole(adminRole, alice.address);
      expect(await inviteToken.hasRole(adminRole, alice.address)).to.equal(false);
    });

    it("Prevents non-admins from assigning roles", async () => {
      const { inviteToken } = await setup();

      await expect(inviteToken.connect(minter).grantRole(minterRole, alice.address)).to.be.revertedWith(
        "AccessControl: account",
      );
    });
  });

  describe("Token functions", async () => {
    it("Allows minters to mint", async () => {
      const { inviteToken } = await setup();

      await inviteToken.connect(minter).mint(alice.address, 1);
      expect(await inviteToken.balanceOf(alice.address)).to.equal(1);
    });

    it("Allows batch minting", async () => {
      const { inviteToken } = await setup();

      await inviteToken.connect(minter).batchMint([minter.address, burner.address, alice.address], 1);
      expect(await inviteToken.balanceOf(minter.address)).to.equal(1);
      expect(await inviteToken.balanceOf(burner.address)).to.equal(1);
      expect(await inviteToken.balanceOf(alice.address)).to.equal(1);
    });

    it("Prevents non-minters from minting", async () => {
      const { inviteToken } = await setup();

      await expect(inviteToken.connect(burner).mint(alice.address, 1)).to.be.revertedWith("Only minters can mint");
      expect(await inviteToken.balanceOf(alice.address)).to.equal(0);
    });

    it("Allows burners to burn", async () => {
      const { inviteToken } = await setup();

      await inviteToken.connect(minter).mint(alice.address, 1);
      expect(await inviteToken.balanceOf(alice.address)).to.equal(1);

      await inviteToken.connect(burner).burn(alice.address, 1);
      expect(await inviteToken.balanceOf(alice.address)).to.equal(0);
    });

    it("Prevents non-burners from burning", async () => {
      const { inviteToken } = await setup();

      await inviteToken.connect(minter).mint(alice.address, 1);
      expect(await inviteToken.balanceOf(alice.address)).to.equal(1);

      expect(inviteToken.connect(minter).burn(alice.address, 1)).to.be.revertedWith("Only burners can burn");
      expect(await inviteToken.balanceOf(alice.address)).to.equal(1);
    });

    it("Allows transfers", async () => {
      const { inviteToken } = await setup();

      await inviteToken.connect(minter).mint(minter.address, 1);
      expect(await inviteToken.balanceOf(minter.address)).to.equal(1);

      await inviteToken.connect(minter).transfer(alice.address, 1);
      expect(await inviteToken.balanceOf(minter.address)).to.equal(0);
      expect(await inviteToken.balanceOf(alice.address)).to.equal(1);
    });
  });
});
