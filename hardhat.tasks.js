/* eslint-disable no-console */
const { ENSRegistry, PublicResolver, ReverseRegistrar } = require("@ensdomains/ens-contracts");
const { getEnsAddress, getResolverContract, getName } = require("@ensdomains/ensjs");
const ENS = require("@ensdomains/ensjs").default;
const namehash = require("@ensdomains/eth-ens-namehash");
const { ethers: ethersLibrary } = require("ethers");
const { task } = require("hardhat/config");
const { utils } = require("web3");

task("tenderly-verify", "verifies current deployment on tenderly").setAction(
  async (args, { tenderly, deployments }) => {
    const contracts = [
      // { name: "Controller", address: (await deployments.get("Controller")).address },
      { name: "ControllerV1", address: (await deployments.get("ControllerV1")).address },
      { name: "MemberToken", address: (await deployments.get("MemberToken")).address },
      { name: "ControllerRegistry", address: (await deployments.get("ControllerRegistry")).address },
      { name: "PodEnsRegistrar", address: (await deployments.get("PodEnsRegistrar")).address },
    ];
    await tenderly.verify(...contracts);
  },
);

task("set-ship-state", "sets restrictions to closed, open, onlyShip or onlySafeWithShip")
  .addPositionalParam("state")
  .setAction(async (args, { getNamedAccounts, ethers }) => {
    const { deployer } = await getNamedAccounts();
    const podEnsRegistrar = await ethers.getContract("PodEnsRegistrar", deployer);

    const stateEnum = {
      onlySafeWithShip: 0,
      onlyShip: 1,
      open: 2,
      closed: 3,
    };

    const { state } = args;

    const currentState = await podEnsRegistrar.state();
    if (currentState === stateEnum[state]) {
      console.log("Contract was already set to that state");
      return;
    }
    await podEnsRegistrar.setRestrictionState(stateEnum[state]);
    console.log(`Successfully changed state to ${state}`);
  });

task("mint", "mints tokens to an address, with an optional amount")
  .addPositionalParam("recipient")
  .addOptionalPositionalParam("amount")
  .setAction(async (args, { getNamedAccounts, ethers }) => {
    const { deployer } = await getNamedAccounts();
    const inviteToken = await ethers.getContract("InviteToken", deployer);
    const permissions = await ethers.getContract("PermissionManager", deployer);

    const minterRole = await inviteToken.MINTER_ROLE();

    const hasRole = await inviteToken.hasRole(minterRole, permissions.address);
    console.log("hasRole", hasRole);
    const { recipient, amount } = args;

    let balance = await inviteToken.balanceOf(recipient);
    console.log("Old balance", balance.toNumber());

    const { data } = await inviteToken.populateTransaction.mint(recipient, amount || 1);
    const res = await permissions.callAsOwner(inviteToken.address, data);
    await res.wait(1);
    balance = await inviteToken.balanceOf(recipient);
    console.log("New balance", balance.toNumber());
  });

task("set-burner", "registers contract as invite burner").setAction(
  async (args, { getNamedAccounts, ethers, deployments }) => {
    const { deployer } = await getNamedAccounts();
    const inviteToken = await ethers.getContract("InviteToken", deployer);

    const contract = (await deployments.get("PodEnsRegistrar", deployer)).address;
    const tx = await inviteToken.grantRole(inviteToken.BURNER_ROLE(), contract);

    console.log(tx);
    console.log(`Added ${contract} as burner for ${inviteToken.address}`);
  },
);

task("register-controller", "registers controller with controller registry")
  .addOptionalPositionalParam("controller")
  .setAction(async (args, { getNamedAccounts, ethers, deployments }) => {
    const { deployer } = await getNamedAccounts();
    const controllerRegistry = await ethers.getContract("ControllerRegistry", deployer);

    const controller = args.controller || (await deployments.get("ControllerV1", deployer)).address;

    await controllerRegistry.registerController(controller);
    console.log(`Registered ${controller} with controller Registry`);
  });

task("ens-setApproval", "sets ens approval for podEnsRegistrar with ensHolder account")
  .addOptionalPositionalParam("controller")
  .setAction(async (args, { getNamedAccounts, getChainId, ethers, deployments }) => {
    const { ensHolder } = await getNamedAccounts();
    const ensHolderSigner = ethers.provider.getSigner(ensHolder);

    const network = await getChainId();
    const ensRegistryAddress =
      network === "31337" ? (await deployments.get("ENSRegistry")).address : getEnsAddress(network);

    const { address: podEnsRegistrarAddress } = await deployments.get("PodEnsRegistrar");

    const ensRegistry = new ethers.Contract(ensRegistryAddress, ENSRegistry, ensHolderSigner);
    // approve podENSRegistry to make pod.eth changes on behalf of ensHolder
    await ensRegistry.setApprovalForAll(podEnsRegistrarAddress, true);

    console.log(`Set ${ensHolder} approvalForAll for ${podEnsRegistrarAddress} with ens ${ensRegistryAddress}`);
  });

task("update-registrar", "upgrade controller to new registrar").setAction(
  async (args, { getNamedAccounts, ethers, deployments }) => {
    const { deployer } = await getNamedAccounts();
    const deployerSigner = ethers.provider.getSigner(deployer);
    const { address: podEnsRegistrarAddress } = await ethers.getContract("PodEnsRegistrar", deployer);

    await (await ethers.getContract("Controller", deployerSigner)).updatePodEnsRegistrar(podEnsRegistrarAddress);
    await (await ethers.getContract("ControllerV1.1", deployerSigner)).updatePodEnsRegistrar(podEnsRegistrarAddress);
    await (await ethers.getContract("ControllerV1.2", deployerSigner)).updatePodEnsRegistrar(podEnsRegistrarAddress);
    await (await ethers.getContract("ControllerV1.3", deployerSigner)).updatePodEnsRegistrar(podEnsRegistrarAddress);
  },
);

task("ens-approve-registrar", "upgrade controller to new registrar").setAction(
  async (args, { getNamedAccounts, getChainId, ethers, deployments }) => {
    const { deployer } = await getNamedAccounts();
    const network = await getChainId();
    const deployerSigner = ethers.provider.getSigner(deployer);
    const permissionManager = await ethers.getContract("PermissionManager", deployer);

    const { address: podEnsRegistrarAddress } = await ethers.getContract("PodEnsRegistrar", deployer);

    const ensRegistryAddress =
      network === "31337" ? (await deployments.get("ENSRegistry")).address : getEnsAddress(network);

    const ensRegistry = new ethers.Contract(ensRegistryAddress, ENSRegistry, deployerSigner);
    // approve podENSRegistry to make ens changes on behalf of permissionManager
    const { data } = await ensRegistry.populateTransaction.setApprovalForAll(podEnsRegistrarAddress, true);
    const res = await permissionManager.callAsOwner(ensRegistry.address, data);
    await res.wait(1);
  },
);

task("update-subnode-owner", "updates the ENS owner for a list of pod IDs")
  .addPositionalParam("startPod")
  .addOptionalPositionalParam("endPod")
  .setAction(async (args, { getChainId, ethers }) => {
    const IController = require("./artifacts/contracts/interfaces/IControllerV1.sol/IControllerV1.json");

    const { startPod, endPod } = args;
    const network = await getChainId();
    const ens = new ENS({ provider: ethers.provider, ensAddress: getEnsAddress(network) });

    const { address: newRegistrar } = await ethers.getContract("PodEnsRegistrar");
    const memberToken = await ethers.getContract("MemberToken");
    console.log("newRegistrar", newRegistrar);
    const ROOT = network === "1" ? "pod.xyz" : "pod.eth";

    // Generate an array of pod IDs.
    const podIds = [];
    if (!endPod) {
      podIds.push(startPod);
    } else {
      for (let i = parseInt(startPod, 10); i <= parseInt(endPod, 10); i += 1) {
        podIds.push(i);
      }
    }
    const labels = await Promise.all(
      podIds.map(async podId => {
        const controllerAddress = await memberToken.memberController(podId);
        const controller = new ethers.Contract(controllerAddress, IController.abi, ethers.provider);
        const safe = await controller.podIdToSafe(podId);
        const name = await ens.getName(safe);
        console.log("name", name);
        if (name.name === null) return null;
        return name.name.split(".")[0];
      }),
    );
    console.log("labels", labels);
    const root = ens.name(ROOT);

    for (let i = 0; i < labels.length; i += 1) {
      // TODO: filter malformed ENS names
      if (labels[i].includes("'")) continue;
      console.log(`migrating subnode ${labels[i]} to ${newRegistrar}`);
      try {
        const res = await root.setSubnodeOwner(namehash.normalize(labels[i]), newRegistrar);
        await res.wait(1);
      } catch (err) {
        console.log(err);
        console.log(`Failed on index ${i} - ${labels[i]}`);
        break;
      }
    }
  });

task("add-ens-podid", "updates the ENS owner for a list of pod IDs")
  .addPositionalParam("startPod")
  .addOptionalPositionalParam("endPod")
  .setAction(async (args, { getChainId, ethers }) => {
    const { startPod, endPod } = args;
    const network = await getChainId();
    const ens = new ENS({ provider: ethers.provider, ensAddress: getEnsAddress(network) });
    const controller = await ethers.getContract("Controller");
    const ensRegistrar = await ethers.getContract("PodEnsRegistrar");
    const ROOT = network === "1" ? "pod.xyz" : "pod.eth";

    // Generate an array of pod IDs.
    const podIds = [];
    if (!endPod) {
      podIds.push(startPod);
    } else {
      for (let i = parseInt(startPod, 10); i <= parseInt(endPod, 10); i += 1) {
        podIds.push(i);
      }
    }

    const ensNames = await Promise.all(
      podIds.map(async podId => {
        const safe = await controller.podIdToSafe(podId);
        const { name } = await ens.getName(safe);
        return name;
      }),
    );
    console.log("ensNames", ensNames);

    for (let i = 0; i < ensNames.length; i += 1) {
      // TODO: filter malformed ENS names
      if (ensNames[i].includes("'")) continue;
      console.log(`${ensNames[i]} podId to ${podIds[i].toString()}`);
      try {
        const res = await ensRegistrar.setText(ethers.utils.namehash(ensNames[i]), "podId", podIds[i].toString());
        await res.wait(1);
      } catch (err) {
        console.log(err);
        console.log(`Failed on index ${i} - ${ensNames[i]}`);
        break;
      }
    }
  });

task("add-permission-owner", "adds an address to be an owner of the Permissions contract")
  .addPositionalParam("newOwner")
  .setAction(async (args, { getChainId, ethers }) => {
    const { newOwner } = args;
    const { deployer } = await getNamedAccounts();

    const Permissions = await ethers.getContract("PermissionManager", deployer);
    const adminRole = await Permissions.DEFAULT_ADMIN_ROLE();
    // await Permissions.grantRole(adminRole, newOwner);
    const hasRole = await Permissions.hasRole(adminRole, newOwner);
    if (hasRole) console.log("Granted permission successfully");
    else console.log("Failed to grant permission");
  });

task("migrate-contracts", "migrates contract owners to the Permissions contract").setAction(
  async (args, { getNamedAccounts, ethers }) => {
    const { deployer } = await getNamedAccounts();
    const deployerSigner = ethers.provider.getSigner(deployer);

    const Permissions = await ethers.getContract("PermissionManager", deployer);
    const { address: permissionsAddress } = await ethers.getContract("PermissionManager", deployer);

    const adminRole = await Permissions.DEFAULT_ADMIN_ROLE();
    const mintRole = (await ethers.getContract("InviteToken", deployer)).MINTER_ROLE();
    await (await ethers.getContract("MemberToken", deployerSigner)).transferOwnership(permissionsAddress);
    await (await ethers.getContract("InviteToken", deployerSigner)).grantRole(adminRole, permissionsAddress);
    await (await ethers.getContract("InviteToken", deployerSigner)).grantRole(mintRole, permissionsAddress);
    await (await ethers.getContract("ControllerRegistry", deployerSigner)).transferOwnership(permissionsAddress);
    await (await ethers.getContract("Controller", deployerSigner)).transferOwnership(permissionsAddress);
    await (await ethers.getContract("ControllerV1.1", deployerSigner)).transferOwnership(permissionsAddress);
    await (await ethers.getContract("ControllerV1.2", deployerSigner)).transferOwnership(permissionsAddress);
    await (await ethers.getContract("ControllerV1.3", deployerSigner)).transferOwnership(permissionsAddress);
    await (await ethers.getContract("PodEnsRegistrar", deployerSigner)).transferOwnership(permissionsAddress);
  },
);

task("migrate-ens-owner", "change owner of the ENS TLD").setAction(
  async (args, { getChainId, getNamedAccounts, ethers, deployments }) => {
    const { deployer } = await getNamedAccounts();
    const network = await getChainId();
    const deployerSigner = ethers.provider.getSigner(deployer);

    const { address: permissionsAddress } = await ethers.getContract("PermissionManager", deployer);

    const ensRegistryAddress =
      network === "31337" ? (await deployments.get("ENSRegistry")).address : getEnsAddress(network);

    const ensRegistry = new ethers.Contract(ensRegistryAddress, ENSRegistry, deployerSigner);
    const tld = network === "1" ? "xyz" : "eth";
    await ensRegistry.setOwner(ethers.utils.namehash(`pod.${tld}`), permissionsAddress);
  },
);

task("test-ens", "tests to see if ENS works via our Permissions contract").setAction(
  async (args, { getChainId, getNamedAccounts, ethers, deployments }) => {
    const { deployer } = await getNamedAccounts();
    const deployerSigner = ethers.provider.getSigner(deployer);
    const network = await getChainId();

    const Permissions = await ethers.getContract("PermissionManager", deployer);
    const { address: permissionsAddress } = await ethers.getContract("PermissionManager", deployer);

    const PodEnsRegistrar = await ethers.getContract("PodEnsRegistrar", deployer);
    const { data } = await PodEnsRegistrar.populateTransaction.setText(
      ethers.utils.namehash("yourmoms.pod.eth"),
      "butt",
      "butt",
    );

    await Permissions.callAsOwner(PodEnsRegistrar.address, data);

    // const ens = new ENS({ provider: ethers.provider, ensAddress: getEnsAddress(network) });
    // const podEth = await ens.name("pod.eth");
    // console.log("podEth", await podEth.getOwner());
  },
);
