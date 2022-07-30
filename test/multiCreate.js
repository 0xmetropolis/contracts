const { expect } = require("chai");
const { ethers, deployments } = require("hardhat");
const { labelhash } = require("@ensdomains/ensjs");

describe("Controller safe integration test", () => {
  let [admin, alice, bob, charlie] = [];

  let controller;

  const { AddressZero } = ethers.constants;

  // current controller being tested
  const CONTROLLER_LATEST = "ControllerV1.2";

  const setup = async () => {
    [admin, alice, bob, charlie] = await ethers.getSigners();
    await deployments.fixture(["Base", "Registrar", "MultiCreateV1", CONTROLLER_LATEST]);

    // hardhat ethers doesn't recognize controller versions
    const { address: controllerAddress, abi: controllerAbi } = await deployments.get(CONTROLLER_LATEST);
    controller = await ethers.getContractAt(controllerAbi, controllerAddress, admin);

    const podEnsRegistrar = await ethers.getContractAt(
      "PodEnsRegistrar",
      (
        await deployments.get("PodEnsRegistrar")
      ).address,
      admin,
    );

    await podEnsRegistrar.setRestrictionState(2); // 2 == open enrollment

    const memberToken = await ethers.getContractAt(
      "MemberToken",
      (
        await deployments.get("MemberToken")
      ).address,
      admin,
    );

    const multiCreate = await ethers.getContractAt(
      "MultiCreateV1",
      (
        await deployments.get("MultiCreateV1")
      ).address,
      admin,
    );

    return {
      memberToken,
      controller,
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

    const [
      podA, // index 1
      podB, // index 2
      podC, // index 3
    ] = ["a", "b", "c"].map(label => generatePodData(label));

    const { membersArray, thresholds, admins, labels, ensStrings, imageUrls } = convertPodArrayToArgArray([
      podA,
      podB,
      podC,
    ]);

    const initNextPodId = await memberToken.getNextAvailablePodId();

    await multiCreate.createPods(controller.address, membersArray, thresholds, admins, labels, ensStrings, imageUrls);

    const newNextPodId = await memberToken.getNextAvailablePodId();
    // expect 3 pods to have been created
    expect(newNextPodId).to.equal(initNextPodId + 3);
  });

  it("should create non-dependant pod with zero admin", async () => {
    const { multiCreate, memberToken } = await setup();

    const [
      podA, // index 1
      podB, // index 2
      podC, // index 3
    ] = ["a", "b", "c"].map(label => generatePodData(label));

    // set pod admin to zero
    podB.admin = AddressZero;

    const { membersArray, thresholds, admins, labels, ensStrings, imageUrls } = convertPodArrayToArgArray([
      podA,
      podB,
      podC,
    ]);

    const initNextPodId = await memberToken.getNextAvailablePodId();

    await multiCreate.createPods(controller.address, membersArray, thresholds, admins, labels, ensStrings, imageUrls);

    const newNextPodId = await memberToken.getNextAvailablePodId();
    // should create 3 pods
    expect(newNextPodId).to.equal(initNextPodId + 3);
    // expect podA to have admin
    expect(await controller.podAdmin(initNextPodId)).to.equal(admin.address);
    // expect alice to be member of podA
    expect(
      await memberToken.balanceOf(
        alice.address,
        initNextPodId, // podA id
      ),
    ).to.equal(1);
    // expect bob to be member of podA
    expect(
      await memberToken.balanceOf(
        bob.address,
        initNextPodId + 1, // podB id
      ),
    ).to.equal(1);
    // expect charlie to be member of podA
    expect(
      await memberToken.balanceOf(
        charlie.address,
        initNextPodId + 2, // podC id
      ),
    ).to.equal(1);

    // expect podB to have zero admin
    expect(await controller.podAdmin(initNextPodId + 1)).to.equal(ethers.constants.AddressZero);
    // expect podC to have admin
    expect(await controller.podAdmin(initNextPodId + 2)).to.equal(admin.address);
  });

  it("should use an address pointer for setting admin", async () => {
    const { multiCreate, memberToken } = await setup();

    const [
      podA, // index 1
      podB, // index 2
      podC, // index 3
    ] = ["a", "b", "c"].map(label => generatePodData(label));

    // podB admin should be podC

    // override admin of podB with podC pointer
    podC.admin = createAddressPointer(2);

    const { membersArray, thresholds, admins, labels, ensStrings, imageUrls } = convertPodArrayToArgArray([
      podA,
      podB,
      podC,
    ]);

    const initPodId = (await memberToken.getNextAvailablePodId()) - 1;

    await multiCreate.createPods(controller.address, membersArray, thresholds, admins, labels, ensStrings, imageUrls);

    const podBAddress = await controller.podIdToSafe(initPodId + 2);
    // expect podB admin should be podC
    expect(podBAddress).to.equal(await controller.podAdmin(initPodId + 3));
  });

  it("should throw with bad member dependacy order", async () => {
    const { multiCreate } = await setup();

    const [
      podA, // index 1
      podB, // index 2
      podC, // index 3
    ] = ["a", "b", "c"].map(label => generatePodData(label));

    // should throw with podC should be a member of podB

    // override member of podB with podC pointer
    podB.members[0] = createAddressPointer(3);

    const { membersArray, thresholds, admins, labels, ensStrings, imageUrls } = convertPodArrayToArgArray([
      podA,
      podB,
      podC,
    ]);

    await expect(
      multiCreate.createPods(controller.address, membersArray, thresholds, admins, labels, ensStrings, imageUrls),
    ).to.be.revertedWith("Member dependency bad ordering");
  });

  it("should use an address pointer for setting member", async () => {
    const { multiCreate, memberToken } = await setup();

    const [
      podA, // index 1
      podB, // index 2
      podC, // index 3
    ] = ["a", "b", "c"].map(label => generatePodData(label));

    // podB should be a member of podC

    // override member of podC with podB pointer
    podC.members[0] = createAddressPointer(2);

    const { membersArray, thresholds, admins, labels, ensStrings, imageUrls } = convertPodArrayToArgArray([
      podA,
      podB,
      podC,
    ]);

    const initPodId = (await memberToken.getNextAvailablePodId()) - 1;

    await multiCreate.createPods(controller.address, membersArray, thresholds, admins, labels, ensStrings, imageUrls);

    const podBAddress = await controller.podIdToSafe(initPodId + 2);

    // expect podB should be a member of podC
    expect(
      await memberToken.balanceOf(
        podBAddress,
        initPodId + 3, // podC id
      ),
    ).to.equal(1);
  });

  it("should create an agent subpod", async () => {
    const { multiCreate, memberToken } = await setup();

    const [
      podA, // index 1
      podB, // index 2
      podC, // index 3
    ] = ["a", "b", "c"].map(label => generatePodData(label));

    // podB should be a member of podC
    // podC should be admin of podB

    // override member of podC with podB pointer
    podC.members[0] = createAddressPointer(2);

    // override admin of podB with podC pointer
    podB.admin = createAddressPointer(3);

    const { membersArray, thresholds, admins, labels, ensStrings, imageUrls } = convertPodArrayToArgArray([
      podA,
      podB,
      podC,
    ]);

    const initPodId = (await memberToken.getNextAvailablePodId()) - 1;

    await multiCreate.createPods(controller.address, membersArray, thresholds, admins, labels, ensStrings, imageUrls);

    const podBAddress = await controller.podIdToSafe(initPodId + 2);
    const podCAddress = await controller.podIdToSafe(initPodId + 3);

    // expect podB should be a member of podC
    expect(
      await memberToken.balanceOf(
        podBAddress,
        initPodId + 3, // podC id
      ),
    ).to.equal(1);

    // expect podC should be admin of podB
    const podBAdmin = await controller.podAdmin(initPodId + 2);
    expect(podBAdmin).to.equal(podCAddress);
  });
});
