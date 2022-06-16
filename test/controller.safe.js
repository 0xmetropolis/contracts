const { expect, use } = require("chai");
const { waffle, ethers, deployments, getNamedAccounts } = require("hardhat");
const { default: ENS, labelhash, namehash } = require("@ensdomains/ensjs");

const EthersSafe = require("@gnosis.pm/safe-core-sdk").default;

const GnosisSafe = require("@gnosis.pm/safe-contracts/build/artifacts/contracts/GnosisSafe.sol/GnosisSafe.json");
const MultiSend = require("@gnosis.pm/safe-contracts/build/artifacts/contracts/libraries/MultiSend.sol/MultiSend.json");
const FallbackHandler = require("@gnosis.pm/safe-contracts/build/artifacts/contracts/handler/CompatibilityFallbackHandler.sol/CompatibilityFallbackHandler.json");
const { getPreviousModule } = require("./utils");

const { deployContract, provider, solidity } = waffle;

use(solidity);

describe("Controller safe integration test", () => {
  const [admin, alice, bob, charlie] = provider.getWallets();

  let multiSend;
  let controller;
  let fallbackHandler;

  const { HashZero, AddressZero } = ethers.constants;

  const TX_OPTIONS = { gasLimit: 4000000 };

  const THRESHOLD = 1;
  const MEMBERS = [alice.address, bob.address];
  const POD_ID = 0;
  const IMAGE_URL = "https://orcaprotocol-nft.vercel.app/assets/testnet/00000001";

  // current controller being tested
  const CONTROLLER_LATEST = "ControllerV1.2";

  const createSafeSigner = async (safe, signer) => {
    const { chainId } = await provider.getNetwork();

    return EthersSafe.create({
      ethers,
      safeAddress: safe.address,
      providerOrSigner: signer,
      contractNetworks: {
        [chainId]: {
          multiSendAddress: multiSend.address,
        },
      },
    });
  };

  const createPodSafe = async (adminAddress, podId, label, ensString) => {
    await controller
      .connect(admin)
      .createPod(MEMBERS, THRESHOLD, adminAddress, label, ensString, podId, IMAGE_URL, TX_OPTIONS);
    // query the new gnosis safe
    const safeAddress = await controller.podIdToSafe(podId);
    return new ethers.Contract(safeAddress, GnosisSafe.abi, admin);
  };

  const createPodWithExistingSafe = async (gnosisSafeProxyFactory, gnosisSafeMaster, ensName, expectedPodId) => {
    const existingSafeAddress = await gnosisSafeProxyFactory.callStatic.createProxy(gnosisSafeMaster.address, HashZero);
    await gnosisSafeProxyFactory.createProxy(gnosisSafeMaster.address, HashZero);
    const safe = gnosisSafeMaster.attach(existingSafeAddress);

    await safe.setup(MEMBERS, 1, AddressZero, HashZero, fallbackHandler.address, AddressZero, 0, AddressZero);

    const txArgs = {
      to: safe.address,
      data: safe.interface.encodeFunctionData("enableModule", [controller.address]),
      value: 0,
    };

    const safeSignerAlice = await createSafeSigner(safe, alice);
    const tx = await safeSignerAlice.createTransaction(txArgs);
    await safeSignerAlice.executeTransaction(tx);

    await controller
      .connect(alice)
      .createPodWithSafe(
        admin.address,
        safe.address,
        labelhash(ensName),
        `${ensName}.pod.eth`,
        expectedPodId,
        IMAGE_URL,
      );
    const podId = await controller.connect(admin).safeToPodId(existingSafeAddress);

    return { safeAddress: existingSafeAddress, podId };
  };

  const setup = async () => {
    await deployments.fixture(["Base", "Registrar", CONTROLLER_LATEST]);
    // Deploy the master safe contract and multisend
    multiSend = await deployContract(admin, MultiSend);
    fallbackHandler = await deployContract(admin, FallbackHandler);
    const { ensHolder } = await getNamedAccounts();

    controller = await ethers.getContract(CONTROLLER_LATEST, admin);

    const publicResolver = await ethers.getContract("PublicResolver", admin);
    const ensRegistry = await ethers.getContract("ENSRegistry", ensHolder);

    const podEnsRegistrar = await ethers.getContract("PodEnsRegistrar", admin);
    await podEnsRegistrar.setRestrictionState(2); // 2 == open enrollment

    const ensReverseRegistrar = await ethers.getContract("ReverseRegistrar", alice);

    const memberToken = await ethers.getContract("MemberToken", admin);
    const gnosisSafeProxyFactory = await ethers.getContract("GnosisSafeProxyFactory", admin);
    const gnosisSafeMaster = await ethers.getContract("GnosisSafe", admin);

    const podSafe = await createPodSafe(admin.address, POD_ID, labelhash("test"), "test.pod.eth");
    const ethersSafe = await createSafeSigner(podSafe, admin);

    const ens = new ENS({ provider, ensAddress: ensRegistry.address });

    return {
      ensReverseRegistrar,
      memberToken,
      publicResolver,
      ethersSafe,
      gnosisSafeProxyFactory,
      podEnsRegistrar,
      gnosisSafeMaster,
      podSafe,
      ens,
    };
  };

  describe("when creating new pod with safe deployment", () => {
    it("should create a new safe with safe teller module", async () => {
      const { ethersSafe } = await setup();

      // threshold and owners
      expect(await ethersSafe.getThreshold()).to.equal(THRESHOLD);
      expect(await ethersSafe.getOwners()).to.deep.equal(MEMBERS);
      // check to see if module has been enabled
      expect(await ethersSafe.isModuleEnabled(controller.address)).to.equal(true);
    });

    it("should distribute member tokens and set admin", async () => {
      const { memberToken } = await setup();

      // should set admin
      expect(await controller.podAdmin(POD_ID)).to.equal(admin.address);
      // should mint member tokens
      expect(await memberToken.balanceOf(alice.address, POD_ID)).to.equal(1);
      expect(await memberToken.balanceOf(bob.address, POD_ID)).to.equal(1);
    });

    it("should set ENS text for podId", async () => {
      const { publicResolver } = await setup();

      expect(await publicResolver.text(namehash("test.pod.eth"), "podId")).to.equal(POD_ID.toString());
      expect(await publicResolver.text(namehash("test.pod.eth"), "avatar")).to.equal(IMAGE_URL);
    });
  });

  describe("when creating a new pod and safe simultaneously", () => {
    it("should be able to add a fresh pod as a member", async () => {
      const { memberToken, podSafe: pod1 } = await setup();
      await createPodSafe(admin.address, POD_ID + 1, labelhash("test2"), "test2.pod.eth");

      // Mint pod1 to the newer pod as a member.
      await memberToken.connect(admin).mint(pod1.address, POD_ID + 1, HashZero);
      expect(await memberToken.balanceOf(pod1.address, POD_ID + 1)).to.equal(1);
    });

    it("should be able to add an existing pod as a member", async () => {
      const { memberToken, gnosisSafeProxyFactory, gnosisSafeMaster } = await setup();
      const nextId = (await memberToken.nextAvailablePodId()).toNumber();
      const pod1 = await createPodWithExistingSafe(
        gnosisSafeProxyFactory,
        gnosisSafeMaster,
        "test2",
        nextId,
        IMAGE_URL,
      );
      const pod2 = await createPodWithExistingSafe(
        gnosisSafeProxyFactory,
        gnosisSafeMaster,
        "test3",
        nextId + 1,
        IMAGE_URL,
      );

      // Add the existingSafeAddress to the fresh safe + pod
      await memberToken.connect(admin).mint(pod2.safeAddress, pod1.podId, HashZero);
      expect(await memberToken.balanceOf(pod2.safeAddress, pod1.podId)).to.equal(1);
    });
  });

  describe("when creating new pod with existing safe", () => {
    it("should create a new safe with safe teller module", async () => {
      const { memberToken, gnosisSafeProxyFactory, gnosisSafeMaster } = await setup();

      const safeAddress = await gnosisSafeProxyFactory.callStatic.createProxy(gnosisSafeMaster.address, HashZero);
      await gnosisSafeProxyFactory.createProxy(gnosisSafeMaster.address, HashZero);
      const safe = gnosisSafeMaster.attach(safeAddress);

      await safe.setup(MEMBERS, 1, AddressZero, HashZero, AddressZero, AddressZero, 0, AddressZero);

      const txArgs = {
        to: safe.address,
        data: safe.interface.encodeFunctionData("enableModule", [controller.address]),
        value: 0,
      };

      const safeSignerAlice = await createSafeSigner(safe, alice);
      const tx = await safeSignerAlice.createTransaction(txArgs);
      await safeSignerAlice.executeTransaction(tx);

      await controller
        .connect(alice)
        .createPodWithSafe(admin.address, safe.address, labelhash("test2"), "test2.pod.eth", 1, IMAGE_URL);

      // should set admin
      expect(await controller.podAdmin(POD_ID + 1)).to.equal(admin.address);
      // should mint member tokens
      expect(await memberToken.balanceOf(alice.address, POD_ID + 1)).to.equal(1);
      expect(await memberToken.balanceOf(bob.address, POD_ID + 1)).to.equal(1);

      // should throw on subsequent create
      await expect(
        controller
          .connect(alice)
          .createPodWithSafe(admin.address, safe.address, labelhash("test2"), "test2.pod.eth", 2, IMAGE_URL),
      ).to.be.revertedWith("safe already in use");
    });
  });

  describe("when a pod has an admin", () => {
    it("should let admin set new admin", async () => {
      await setup();

      await controller.updatePodAdmin(POD_ID, alice.address);
      expect(await controller.podAdmin(POD_ID)).to.equal(alice.address);
      const safe = await controller.podIdToSafe(POD_ID);
      expect(await controller.areModulesLocked(safe)).to.equal(true);
    });
    it("should let admin remove admin", async () => {
      await setup();

      await controller.updatePodAdmin(POD_ID, AddressZero);
      expect(await controller.podAdmin(POD_ID)).to.equal(AddressZero);
      const safe = await controller.podIdToSafe(POD_ID);
      expect(await controller.areModulesLocked(safe)).to.equal(false);
    });
    it("should let admin unlock modules", async () => {
      await setup();

      await controller.setPodModuleLock(POD_ID, false);

      const safe = await controller.podIdToSafe(POD_ID);
      expect(await controller.areModulesLocked(safe)).to.equal(false);
    });
    it("should throw if safe updates admin", async () => {
      const { ethersSafe } = await setup();

      const txArgs = {
        to: controller.address,
        data: controller.interface.encodeFunctionData("updatePodAdmin", [POD_ID, alice.address]),
        value: 0,
      };

      await expect(ethersSafe.createTransaction(txArgs)).to.be.revertedWith("Only admin can update admin");
    });
    it("should throw if user updates module lock", async () => {
      await setup();

      await expect(controller.connect(bob).setPodModuleLock(POD_ID, false)).to.be.revertedWith(
        "Must be admin to set module lock",
      );
    });
  });

  describe("when a pod has no admin", () => {
    it("should throw if member updates admin", async () => {
      await setup();
      await createPodSafe(AddressZero, POD_ID + 1, labelhash("test2"), "test2.pod.eth");

      await expect(controller.connect(alice).updatePodAdmin(POD_ID + 1, alice.address)).to.be.revertedWith(
        "Only safe can add new admin",
      );
    });
    it("should let safe update admin", async () => {
      await setup();
      const podSafe = await createPodSafe(AddressZero, POD_ID + 1, labelhash("test2"), "test2.pod.eth");
      const ethersSafe = await createSafeSigner(podSafe, alice);

      const txArgs = {
        to: controller.address,
        data: controller.interface.encodeFunctionData("updatePodAdmin", [POD_ID + 1, alice.address]),
        value: 0,
      };
      const tx = await ethersSafe.createTransaction(txArgs);
      await ethersSafe.executeTransaction(tx);

      expect(await controller.podAdmin(POD_ID + 1)).to.equal(alice.address);
      const safe = await controller.podIdToSafe(POD_ID + 1);
      expect(await controller.areModulesLocked(safe)).to.equal(true);
    });
  });

  describe("managing pod owners with membership NFTs", () => {
    describe("when managing pod owners with membership NFTs", () => {
      it("should be able to transfer memberships", async () => {
        const { memberToken, ethersSafe } = await setup();

        await memberToken
          .connect(alice)
          .safeTransferFrom(alice.address, charlie.address, POD_ID, 1, HashZero, TX_OPTIONS);
        // check token balance
        expect(await memberToken.balanceOf(alice.address, POD_ID)).to.equal(0);
        expect(await memberToken.balanceOf(charlie.address, POD_ID)).to.equal(1);
        // check safe owners
        expect(await ethersSafe.getOwners()).to.deep.equal([charlie.address, bob.address]);
      });

      it("should be able to burn memberships", async () => {
        const { memberToken, ethersSafe } = await setup();

        await memberToken.connect(admin).burn(alice.address, POD_ID, TX_OPTIONS);
        // check token balance
        expect(await memberToken.balanceOf(alice.address, POD_ID)).to.equal(0);
        // check safe owners
        expect(await ethersSafe.getOwners()).to.deep.equal([bob.address]);
      });

      it("should be able to mint memberships", async () => {
        const { memberToken, ethersSafe } = await setup();

        await memberToken.connect(admin).mint(charlie.address, POD_ID, HashZero);
        // check token balance
        expect(await memberToken.balanceOf(charlie.address, POD_ID)).to.equal(1);
        // check safe owners
        expect(await ethersSafe.getOwners()).to.deep.equal([charlie.address, alice.address, bob.address]);
      });
    });
  });

  describe("ejecting a safe", () => {
    async function checkEject({ ethersSafe, memberToken, publicResolver, podId, ensName }) {
      // Safe owners should be untouched.
      expect(await ethersSafe.getOwners()).to.deep.equal([alice.address, bob.address]);
      expect(await memberToken.balanceOf(alice.address, podId)).to.equal(0);
      expect(await memberToken.balanceOf(bob.address, podId)).to.equal(0);

      // Checking if reverse resolver is zeroed.
      expect(await publicResolver.name(namehash(ensName))).to.equal("");
      // Checking if there is an owner for the node.
      expect(await publicResolver["addr(bytes32)"](namehash(ensName))).to.equal(ethers.constants.AddressZero);
      expect(await publicResolver.text(namehash(ensName), "podId")).to.equal("");
      expect(await publicResolver.text(namehash(ensName), "avatar")).to.equal("");
    }

    it("should be able to eject a safe via an admin call", async () => {
      const { memberToken, ethersSafe, publicResolver, ens, podSafe } = await setup();
      // This is just to make sure the addr call works properly.
      expect(await publicResolver["addr(bytes32)"](namehash("test.pod.eth"))).to.not.equal(
        ethers.constants.AddressZero,
      );
      expect((await ens.getName(podSafe.address)).name).to.equal("test.pod.eth");

      const previousModule = await getPreviousModule(podSafe.address, controller.address, provider);
      await controller.connect(admin).ejectSafe(POD_ID, labelhash("test"), previousModule);

      await checkEject({ ethersSafe, memberToken, publicResolver, podId: POD_ID, ensName: "test.pod.eth" });

      // Checking reverse resolver is zeroed. Reverse resolver check happens separately.
      expect((await ens.getName(podSafe.address)).name).to.equal("");
      expect(await ethersSafe.isModuleEnabled(controller.address)).to.equal(false);
    });

    it("should be able to eject a safe via a proposal (safe transaction)", async () => {
      const { ethersSafe, memberToken, ens, publicResolver, podSafe } = await setup();
      const noAdminPod = await createPodSafe(
        ethers.constants.AddressZero,
        POD_ID + 1,
        labelhash("noadmin"),
        "noadmin.pod.eth",
      );
      const safeSigner = await createSafeSigner(noAdminPod, alice);

      const previousModule = await getPreviousModule(podSafe.address, controller.address, provider);
      // Constructing TX to eject safe
      const txArgs = {
        to: controller.address,
        data: controller.interface.encodeFunctionData("ejectSafe", [POD_ID + 1, labelhash("noadmin"), previousModule]),
        value: 0,
      };
      const tx = await safeSigner.createTransaction(txArgs);
      await safeSigner.executeTransaction(tx);

      await checkEject({
        ethersSafe,
        memberToken,
        publicResolver,
        podId: POD_ID + 1,
        ensName: "noadmin.pod.eth",
      });

      // Checking reverse resolver is zeroed.
      expect(await publicResolver.name(namehash("noadmin.pod.eth"))).to.equal("");
      expect((await ens.getName(noAdminPod.address)).name).to.equal("");

      expect(await safeSigner.isModuleEnabled(controller.address)).to.equal(false);
    });

    it("should be able to eject pods that have had the module disabled", async () => {
      const { ethersSafe, memberToken, ens, publicResolver } = await setup();

      const noAdminPod = await createPodSafe(
        ethers.constants.AddressZero,
        POD_ID + 1,
        labelhash("noadmin"),
        "noadmin.pod.eth",
      );
      const safeSigner = await createSafeSigner(noAdminPod, alice);

      const previousModule = await getPreviousModule(noAdminPod.address, controller.address, provider);

      // Manually disable module.
      const txArgs = {
        to: noAdminPod.address,
        data: noAdminPod.interface.encodeFunctionData("disableModule", [previousModule, controller.address]),
        value: 0,
      };
      const tx = await safeSigner.createTransaction(txArgs);
      await safeSigner.executeTransaction(tx);

      // eslint-disable-next-line no-unused-expressions
      expect(await noAdminPod.isModuleEnabled(controller.address)).to.be.false;

      // Eject safe with an already disabled module.
      const ejectArgs = {
        to: controller.address,
        data: controller.interface.encodeFunctionData("ejectSafe", [POD_ID + 1, labelhash("noadmin"), previousModule]),
        value: 0,
      };
      const ejectTx = await safeSigner.createTransaction(ejectArgs);
      await safeSigner.executeTransaction(ejectTx);

      await checkEject({
        ethersSafe,
        memberToken,
        publicResolver,
        podId: POD_ID + 1,
        ensName: "noadmin.pod.eth",
        safeSigner,
      });

      // Reverse resolver does not get cleared.
      expect((await ens.getName(noAdminPod.address)).name).to.equal("noadmin.pod.eth");
      // We are able to clear out the public resolver, but not the actual reverse resolver.
      // That's why this record gets cleared, but not the above one.
      expect(await publicResolver.name(namehash("noadmin.pod.eth"))).to.equal("");
      expect(await safeSigner.isModuleEnabled(controller.address)).to.equal(false);
    });

    it("should be able to re-add a pod that was previously deregistered", async () => {
      const { memberToken, publicResolver, ens, podSafe, gnosisSafeProxyFactory, gnosisSafeMaster } = await setup();

      const previousModule = await getPreviousModule(podSafe.address, controller.address, provider);
      await controller.connect(admin).ejectSafe(POD_ID, labelhash("test"), previousModule);

      const nextId = (await memberToken.nextAvailablePodId()).toNumber();
      const newPod = await createPodWithExistingSafe(
        gnosisSafeProxyFactory,
        gnosisSafeMaster,
        "test",
        nextId,
        IMAGE_URL,
      );

      expect((await ens.getName(newPod.safeAddress)).name).to.equal("test.pod.eth");
      expect(await publicResolver["addr(bytes32)"](namehash("test.pod.eth"))).to.not.equal(
        ethers.constants.AddressZero,
      );
      expect(await controller.podIdToSafe(nextId)).to.equal(newPod.safeAddress);
    });

    it("should not allow users to deregister ENS names that don't belong to the safe", async () => {
      const { podSafe } = await setup();

      const previousModule = await getPreviousModule(podSafe.address, controller.address, provider);
      // Set up another pod just so we have a label to work with.
      await createPodSafe(admin.address, POD_ID + 1, labelhash("test2"), "test2.pod.eth");

      // Attempting to eject the original safe, but with the wrong label.
      await expect(controller.connect(admin).ejectSafe(POD_ID, labelhash("test2"), previousModule)).to.be.revertedWith(
        "safe and label didn't match",
      );
    });

    it("should throw if a non-admin attempts to eject safe", async () => {
      const { podSafe } = await setup();

      const previousModule = await getPreviousModule(podSafe.address, controller.address, provider);
      await expect(controller.connect(alice).ejectSafe(POD_ID, labelhash("test"), previousModule)).to.be.revertedWith(
        "must be admin",
      );
    });

    it("should throw if ejecting a non-existent pod", async () => {
      const { podSafe } = await setup();

      const previousModule = await getPreviousModule(podSafe.address, controller.address, provider);
      await expect(
        controller.connect(alice).ejectSafe(POD_ID + 1, labelhash("test"), previousModule),
      ).to.be.revertedWith("pod not registered");
    });
  });
});
