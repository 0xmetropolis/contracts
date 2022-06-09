const { expect, use } = require("chai");
const { waffle, ethers, deployments } = require("hardhat");
const { labelhash } = require("@ensdomains/ensjs");

const { provider, solidity } = waffle;

use(solidity);

describe("Controller safe integration test", () => {
  const [admin, alice, bob, charlie] = provider.getWallets();

  let controller;

  const { AddressZero } = ethers.constants;

  // current controller being tested
  const CONTROLLER_LATEST = "ControllerV1.2";

  const setup = async () => {
    await deployments.fixture(["Base", "Registrar", "MultiCreateV1", CONTROLLER_LATEST]);

    controller = await ethers.getContract(CONTROLLER_LATEST, admin);

    const podEnsRegistrar = await ethers.getContract("PodEnsRegistrar", admin);
    await podEnsRegistrar.setRestrictionState(2); // 2 == open enrollment

    const memberToken = await ethers.getContract("MemberToken", admin);
    const gnosisSafeProxyFactory = await ethers.getContract("GnosisSafeProxyFactory", admin);

    const multiCreate = await ethers.getContract("MultiCreateV1", admin);

    return {
      memberToken,
      controller,
      gnosisSafeProxyFactory,
      podEnsRegistrar,
      multiCreate,
    };
  };

  function generatePodData(label) {
    return {
      members: [alice.address, charlie.address, bob.address],
      threshold: 1,
      admin: admin.address,
      label,
      ensString: label,
      imageUrl: " ",
    };
  }

  function convertPodArrayToArgArray(podData) {
    const membersArray = [];
    const thresholds = [];
    const admins = [];
    const labels = [];
    const ensStrings = [];
    const imageUrls = [];

    podData.forEach(pod => {
      membersArray.push(pod.members);
      thresholds.push(pod.threshold);
      admins.push(pod.admin);
      labels.push(labelhash(pod.label));
      ensStrings.push(pod.ensString);
      imageUrls.push(pod.imageUrl);
    });
    return {
      membersArray,
      thresholds,
      admins,
      labels,
      ensStrings,
      imageUrls,
    };
  }

  function createAddressPointer(number) {
    const cutLength = String(number).length;
    return AddressZero.slice(0, 42 - cutLength) + number;
  }

  it("should create non-dependant pods", async () => {
    const { multiCreate, memberToken } = await setup();

    const podData = ["a", "b", "c"].map(label => generatePodData(label));

    const { membersArray, thresholds, admins, labels, ensStrings, imageUrls } = convertPodArrayToArgArray(podData);

    const initNextPodId = await memberToken.getNextAvailablePodId();

    await multiCreate.createPods(controller.address, membersArray, thresholds, admins, labels, ensStrings, imageUrls);

    const newNextPodId = await memberToken.getNextAvailablePodId();
    expect(newNextPodId).to.equal(initNextPodId + 3);
  });

  it("should create non-dependant pod with zero admin", async () => {
    const { multiCreate, memberToken } = await setup();

    const podData = ["a", "b", "c"].map(label => generatePodData(label));

    const { membersArray, thresholds, admins, labels, ensStrings, imageUrls } = convertPodArrayToArgArray(podData);

    admins[0] = AddressZero;

    const initNextPodId = await memberToken.getNextAvailablePodId();

    await multiCreate.createPods(controller.address, membersArray, thresholds, admins, labels, ensStrings, imageUrls);

    const newNextPodId = await memberToken.getNextAvailablePodId();
    expect(newNextPodId).to.equal(initNextPodId + 3);
  });

  it("should throw with bad admin dependacy order", async () => {
    const { multiCreate } = await setup();

    const podData = ["a", "b", "c"].map(label => generatePodData(label));

    const { membersArray, thresholds, admins, labels, ensStrings, imageUrls } = convertPodArrayToArgArray(podData);

    // override with dependency pointer with bad order - admin for pod 2 is pod 3
    admins[1] = createAddressPointer(3);

    await expect(
      multiCreate.createPods(controller.address, membersArray, thresholds, admins, labels, ensStrings, imageUrls),
    ).to.be.revertedWith("Admin dependency bad ordering");
  });

  it("should use an address pointer for setting admin", async () => {
    const { multiCreate, memberToken } = await setup();

    const podData = ["a", "b", "c"].map(label => generatePodData(label));

    const { membersArray, thresholds, admins, labels, ensStrings, imageUrls } = convertPodArrayToArgArray(podData);

    // override with dependency pointer with - admin for pod 3 is pod 2
    admins[2] = createAddressPointer(2);

    const initPodId = (await memberToken.getNextAvailablePodId()) - 1;

    await multiCreate.createPods(controller.address, membersArray, thresholds, admins, labels, ensStrings, imageUrls);

    const pod2Address = await controller.podIdToSafe(initPodId + 2);
    const pod3Admin = await controller.podAdmin(initPodId + 3);
    expect(pod2Address).to.equal(pod3Admin);
  });

  it("should throw with bad member dependacy order", async () => {
    const { multiCreate } = await setup();

    const podData = ["a", "b", "c"].map(label => generatePodData(label));

    const { membersArray, thresholds, admins, labels, ensStrings, imageUrls } = convertPodArrayToArgArray(podData);

    // override with dependency pointer with bad order - member[0] for pod 2 is pod 3
    membersArray[1][0] = createAddressPointer(3);

    await expect(
      multiCreate.createPods(controller.address, membersArray, thresholds, admins, labels, ensStrings, imageUrls),
    ).to.be.revertedWith("Member dependency bad ordering");
  });

  it("should use an address pointer for setting member", async () => {
    const { multiCreate, memberToken } = await setup();

    const podData = ["a", "b", "c"].map(label => generatePodData(label));

    const { membersArray, thresholds, admins, labels, ensStrings, imageUrls } = convertPodArrayToArgArray(podData);

    // override with dependency pointer with - member[0] of pod 3 is pod 2
    membersArray[2][0] = createAddressPointer(2);

    const initPodId = (await memberToken.getNextAvailablePodId()) - 1;

    await multiCreate.createPods(controller.address, membersArray, thresholds, admins, labels, ensStrings, imageUrls);

    const pod2Address = await controller.podIdToSafe(initPodId + 2);

    expect(await memberToken.balanceOf(pod2Address, initPodId + 3)).to.equal(1);
  });
});
