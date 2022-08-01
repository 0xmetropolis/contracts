// TODO: convert to fork integration test

// const { expect } = require("chai");
// const { ethers, deployments, getNamedAccounts } = require("hardhat");
// const { default: ENS, labelhash, namehash } = require("@ensdomains/ensjs");

// const stateEnum = {
//   onlySafeWithShip: 0,
//   onlyShip: 1,
//   open: 2,
//   closed: 3,
// };

// describe("registrar test", () => {
//   let ensHolderAddress;

//   let ensRegistry;
//   let podEnsRegistrar;
//   let controllerRegistry;
//   let inviteToken;
//   let ensReverseRegistrar;
//   let ens;
//   let [mockController, safe, alice] = [];

//   async function setup() {
//     await deployments.fixture(["Base", "Registrar"]);

//     [mockController, safe, alice] = await ethers.getSigners();
//     const { deployer, ensHolder } = await getNamedAccounts();
//     ensHolderAddress = ensHolder;

//     inviteToken = await ethers.getContract("InviteToken", deployer);
//     ensRegistry = await ethers.getContract("ENSRegistry", ensHolder);
//     podEnsRegistrar = await ethers.getContract("PodEnsRegistrar", deployer);
//     await podEnsRegistrar.setRestrictionState(stateEnum.open);

//     controllerRegistry = await ethers.getContract("ControllerRegistry", deployer);

//     ensReverseRegistrar = await ethers.getContract("ReverseRegistrar", alice);

//     await controllerRegistry.registerController(mockController.address);

//     ens = new ENS({ provider: ethers.provider, ensAddress: ensRegistry.address });
//   }

//   before(async () => {
//     await setup();
//   });

//   it("should return the rootNode hash", async () => {
//     // This is the hash of pod.eth
//     expect(await podEnsRegistrar.getRootNode()).to.equal(
//       "0xa74c8b4e0e15dcc91024ac3999fc5df0e6669b98308ddf55dee349ca1e642d08",
//     );
//   });

//   it("should be able to provide an ens node value given a label", async () => {
//     await setup();
//     expect(await podEnsRegistrar.getEnsNode(labelhash("test"))).to.equal(namehash("test.pod.eth"));
//   });

//   it("should prevent prevent non-controllers/owners from calling setText", async () => {
//     await expect(
//       podEnsRegistrar.connect(alice).setText(ethers.utils.namehash("node"), "key", "value"),
//     ).to.be.revertedWith("sender must be controller/owner");
//   });

//   it("the onlyControllerOrOwner modifier should allow owners to call", async () => {
//     // The testing of controllers is handled by another test below.
//     const { deployer } = await getNamedAccounts();
//     await expect(
//       podEnsRegistrar.connect(deployer).setText(ethers.utils.namehash("node"), "key", "value"),
//     ).to.not.be.revertedWith("sender must be controller/owner");
//   });

//   describe("when setting up PodENS registrar", () => {
//     it("should be able to set reverse resolver name", async () => {
//       expect(await ensRegistry.owner(ethers.utils.namehash("addr.reverse"))).to.equal(ensReverseRegistrar.address);
//       await ensReverseRegistrar.setName("alice.eth");
//       expect(await ens.getName(alice.address)).to.deep.equal({ name: "alice.eth" });
//     });

//     it("should approve registrar in ENSRegistry", async () => {
//       await ensRegistry.setApprovalForAll(podEnsRegistrar.address, true);

//       expect(await ensRegistry.owner(ethers.utils.namehash("pod.eth"))).to.equal(ensHolderAddress);
//       expect(await ensRegistry.isApprovedForAll(ensHolderAddress, podEnsRegistrar.address)).to.equal(true);
//     });
//   });

//   describe("when registering a subdomain", () => {
//     it("should update owner and address", async () => {
//       await podEnsRegistrar
//         .connect(mockController)
//         .registerPod(labelhash("test"), safe.address, mockController.address);

//       expect(await ens.name("test.pod.eth").getOwner()).to.equal(podEnsRegistrar.address);
//       expect(await ens.name("test.pod.eth").getAddress()).to.equal(safe.address);
//     });

//     it("should revert if it is registered again", async () => {
//       await expect(podEnsRegistrar.connect(alice).registerPod(labelhash("test"), safe.address)).to.be.reverted;
//     });

//     it("should let the admin change text", async () => {
//       await podEnsRegistrar.setText(ethers.utils.namehash("test.pod.eth"), "email", "test@email");

//       expect(await ens.name("test.pod.eth").getText("email")).to.equal("test@email");
//     });

//     it("should let the admin change owner", async () => {
//       await podEnsRegistrar.register(labelhash("test"), ensHolderAddress);

//       expect(await ens.name("test.pod.eth").getOwner()).to.equal(ensHolderAddress);
//     });

//     it("should revert if called by invalid controller", async () => {
//       await expect(podEnsRegistrar.connect(alice).registerPod(labelhash("test1"), safe.address)).to.be.reverted;
//     });
//   });

//   describe("onlySafeWithShip state", async () => {
//     let admin;
//     let minterRole;
//     let burnerRole;

//     before(async () => {
//       await setup();
//       await podEnsRegistrar.setRestrictionState(stateEnum.onlySafeWithShip);
//       admin = (await getNamedAccounts()).deployer;

//       // Grant roles
//       minterRole = inviteToken.MINTER_ROLE();
//       burnerRole = inviteToken.BURNER_ROLE();
//       await inviteToken.grantRole(minterRole, admin);
//       await inviteToken.grantRole(burnerRole, podEnsRegistrar.address);

//       // Set up registration prereqs
//       await ensReverseRegistrar.setName("alice.eth");
//       await ensRegistry.setApprovalForAll(podEnsRegistrar.address, true);
//     });

//     it("should prevent a safe with no token from registering a pod", async () => {
//       await expect(
//         podEnsRegistrar.connect(mockController).registerPod(labelhash("test"), safe.address, safe.address),
//       ).to.be.revertedWith("safe must have SHIP token");
//     });

//     it("should prevent a user with tokens from registering a pod with none", async () => {
//       await inviteToken.mint(alice.address, 1);

//       await expect(
//         podEnsRegistrar.connect(mockController).registerPod(labelhash("test"), safe.address, alice.address),
//       ).to.be.revertedWith("safe must have SHIP token");
//     });

//     it("should allow a safe with a SHIP token to register a pod", async () => {
//       await inviteToken.mint(safe.address, 1);

//       await podEnsRegistrar.connect(mockController).registerPod(labelhash("test2"), safe.address, safe.address);
//       expect(await inviteToken.balanceOf(safe.address)).to.equal(0);
//       expect(await ens.name("test2.pod.eth").getOwner()).to.equal(podEnsRegistrar.address);
//       expect(await ens.name("test2.pod.eth").getAddress()).to.equal(safe.address);
//     });

//     it("should allow a user to register a safe that has a token", async () => {
//       await inviteToken.mint(safe.address, 1);

//       await podEnsRegistrar.connect(mockController).registerPod(labelhash("test3"), safe.address, alice.address);
//       expect(await inviteToken.balanceOf(safe.address)).to.equal(0);
//       expect(await ens.name("test3.pod.eth").getOwner()).to.equal(podEnsRegistrar.address);
//       expect(await ens.name("test3.pod.eth").getAddress()).to.equal(safe.address);
//     });
//   });

//   describe("onlyShip state", async () => {
//     let admin;
//     let minterRole;
//     let burnerRole;

//     before(async () => {
//       await setup();
//       await podEnsRegistrar.setRestrictionState(stateEnum.onlyShip);
//       admin = (await getNamedAccounts()).deployer;

//       // Grant roles
//       minterRole = inviteToken.MINTER_ROLE();
//       burnerRole = inviteToken.BURNER_ROLE();
//       await inviteToken.grantRole(minterRole, admin);
//       await inviteToken.grantRole(burnerRole, podEnsRegistrar.address);

//       // Set up registration prereqs
//       await ensReverseRegistrar.setName("alice.eth");
//       await ensRegistry.setApprovalForAll(podEnsRegistrar.address, true);
//     });

//     it("should prevent a safe with no token from registering a pod", async () => {
//       await expect(
//         podEnsRegistrar.connect(mockController).registerPod(labelhash("test"), safe.address, safe.address),
//       ).to.be.revertedWith("sender or safe must have SHIP");
//     });

//     it("should allow a safe with a SHIP token to register a pod", async () => {
//       await inviteToken.mint(safe.address, 1);

//       await podEnsRegistrar.connect(mockController).registerPod(labelhash("test"), safe.address, safe.address);
//       expect(await inviteToken.balanceOf(safe.address)).to.equal(0);
//       expect(await ens.name("test.pod.eth").getOwner()).to.equal(podEnsRegistrar.address);
//       expect(await ens.name("test.pod.eth").getAddress()).to.equal(safe.address);
//     });

//     it("should allow a user to register a safe that has a token", async () => {
//       await inviteToken.mint(safe.address, 1);

//       await podEnsRegistrar.connect(mockController).registerPod(labelhash("test2"), safe.address, alice.address);
//       expect(await inviteToken.balanceOf(safe.address)).to.equal(0);
//       expect(await ens.name("test2.pod.eth").getOwner()).to.equal(podEnsRegistrar.address);
//       expect(await ens.name("test2.pod.eth").getAddress()).to.equal(safe.address);
//     });

//     it("should allow a user that has a token to register a safe", async () => {
//       await inviteToken.mint(alice.address, 1);

//       await podEnsRegistrar.connect(mockController).registerPod(labelhash("test3"), safe.address, alice.address);
//       expect(await inviteToken.balanceOf(alice.address)).to.equal(0);
//       expect(await ens.name("test3.pod.eth").getOwner()).to.equal(podEnsRegistrar.address);
//       expect(await ens.name("test3.pod.eth").getAddress()).to.equal(safe.address);
//     });

//     it("should take the token from the safe, if both the user and a safe have a token", async () => {
//       await inviteToken.batchMint([alice.address, safe.address], 1);
//       expect(await inviteToken.balanceOf(safe.address)).to.equal(1);
//       expect(await inviteToken.balanceOf(alice.address)).to.equal(1);

//       await podEnsRegistrar.connect(mockController).registerPod(labelhash("test4"), safe.address, alice.address);
//       expect(await inviteToken.balanceOf(alice.address)).to.equal(1);
//       expect(await inviteToken.balanceOf(safe.address)).to.equal(0);
//       expect(await ens.name("test4.pod.eth").getOwner()).to.equal(podEnsRegistrar.address);
//       expect(await ens.name("test4.pod.eth").getAddress()).to.equal(safe.address);
//     });
//   });

//   describe("open state", async () => {
//     let admin;
//     let minterRole;
//     let burnerRole;

//     before(async () => {
//       await setup();
//       await podEnsRegistrar.setRestrictionState(stateEnum.open);
//       admin = (await getNamedAccounts()).deployer;

//       // Grant roles
//       minterRole = inviteToken.MINTER_ROLE();
//       burnerRole = inviteToken.BURNER_ROLE();
//       await inviteToken.grantRole(minterRole, admin);
//       await inviteToken.grantRole(burnerRole, podEnsRegistrar.address);

//       // Set up registration prereqs
//       await ensReverseRegistrar.setName("alice.eth");
//       await ensRegistry.setApprovalForAll(podEnsRegistrar.address, true);
//     });

//     it("should allow a safe to register a pod", async () => {
//       await podEnsRegistrar.connect(mockController).registerPod(labelhash("test"), safe.address, safe.address);
//       expect(await ens.name("test.pod.eth").getOwner()).to.equal(podEnsRegistrar.address);
//       expect(await ens.name("test.pod.eth").getAddress()).to.equal(safe.address);
//     });

//     it("should allow a user to register a safe", async () => {
//       await podEnsRegistrar.connect(mockController).registerPod(labelhash("test2"), safe.address, alice.address);
//       expect(await ens.name("test2.pod.eth").getOwner()).to.equal(podEnsRegistrar.address);
//       expect(await ens.name("test2.pod.eth").getAddress()).to.equal(safe.address);
//     });
//   });

//   describe("open state", async () => {
//     before(async () => {
//       await setup();
//       await podEnsRegistrar.setRestrictionState(stateEnum.open);
//     });

//     it("should prevent non-owner from changing state", async () => {
//       expect(await podEnsRegistrar.state()).to.equal(stateEnum.open);
//       await expect(podEnsRegistrar.connect(alice).setRestrictionState(stateEnum.closed)).to.be.revertedWith(
//         "Ownable: caller is not the owner",
//       );
//     });

//     it("should allow a user to register a safe", async () => {
//       expect(await podEnsRegistrar.state()).to.equal(stateEnum.open);
//       await podEnsRegistrar.connect(mockController).setRestrictionState(stateEnum.closed);
//       expect(await podEnsRegistrar.state()).to.equal(stateEnum.closed);
//     });
//   });
// });
