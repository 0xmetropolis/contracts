/* eslint-disable no-console */
const { ENSRegistry } = require("@ensdomains/ens-contracts");
const { getEnsAddress } = require("@ensdomains/ensjs");
const ENS = require("@ensdomains/ensjs").default;
const namehash = require("@ensdomains/eth-ens-namehash");
const { task } = require("hardhat/config");

task("tenderly-verify", "verifies current deployment on tenderly").setAction(
  async (args, { tenderly, deployments }) => {
    const contracts = [
      // { name: "Controller", address: (await deployments.get("Controller")).address },
      { name: "ControllerV1", address: (await deployments.get("ControllerV1.4")).address },
      { name: "MemberToken", address: (await deployments.get("MemberToken")).address },
      { name: "ControllerRegistry", address: (await deployments.get("ControllerRegistry")).address },
      { name: "PodEnsRegistrar", address: (await deployments.get("PodEnsRegistrar")).address },
    ];
    await tenderly.verify(...contracts);
  },
);

task("mint", "mints tokens to an address, with an optional amount")
  .addPositionalParam("recipient")
  .addOptionalPositionalParam("amount")
  .setAction(async (args, { getNamedAccounts, ethers, artifacts }) => {
    const { deployer } = await getNamedAccounts();
    const deployerSigner = ethers.provider.getSigner(deployer);
    const inviteToken = await ethers.getContractAtFromArtifact(
      await artifacts.readArtifact("InviteToken"),
      deployerSigner,
    );
    const permissions = await ethers.getContractAtFromArtifact(
      await artifacts.readArtifact("PermissionManager"),
      deployerSigner,
    );

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

task("set-ship-state", "sets restrictions to closed, open, onlyShip or onlySafeWithShip")
  .addPositionalParam("state")
  .setAction(async (args, { getNamedAccounts, deployments, ethers, artifacts }) => {
    const { deployer } = await getNamedAccounts();
    const deployerSigner = ethers.provider.getSigner(deployer);

    const podEnsRegistrar = await ethers.getContractAtFromArtifact(
      await artifacts.readArtifact("PodEnsRegistrar"),
      (
        await deployments.get("PodEnsRegistrar")
      ).address,
      deployerSigner,
    );

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

task("set-burner", "registers contract as invite burner").setAction(
  async (args, { getNamedAccounts, ethers, deployments, artifacts }) => {
    const { deployer } = await getNamedAccounts();
    const deployerSigner = ethers.provider.getSigner(deployer);
    const inviteToken = await ethers.getContractAtFromArtifact(
      await artifacts.readArtifact("InviteToken"),
      deployerSigner,
    );

    const contract = (await deployments.get("PodEnsRegistrar", deployer)).address;
    const tx = await inviteToken.grantRole(inviteToken.BURNER_ROLE(), contract);

    console.log(tx);
    console.log(`Added ${contract} as burner for ${inviteToken.address}`);
  },
);

task("register-controller", "registers controller with controller registry")
  .addOptionalPositionalParam("controller")
  .setAction(async (args, { getNamedAccounts, ethers, deployments, artifacts }) => {
    const { deployer } = await getNamedAccounts();
    const deployerSigner = ethers.provider.getSigner(deployer);

    const controllerRegistry = await ethers.getContractAtFromArtifact(
      await artifacts.readArtifact("ControllerRegistry"),
      deployerSigner,
    );

    const controller = args.controller || (await deployments.get("ControllerV1", deployerSigner)).address;
    const isRegistered = await controllerRegistry.isRegistered(controller);
    if (isRegistered) {
      console.log(`${controller} was already registered`);
      return;
    }

    const Permissions = await ethers.getContractAtFromArtifact(
      await artifacts.readArtifact("PermissionManager"),
      deployerSigner,
    );

    const { data } = await controllerRegistry.populateTransaction.registerController(controller);

    await Permissions.callAsOwner(controllerRegistry.address, data);
    console.log(`Registered ${controller} with controller Registry`);
  });

task("ens-setApproval", "sets ens approval for podEnsRegistrar with ensHolder account")
  .addOptionalPositionalParam("controller")
  .setAction(async (args, { getNamedAccounts, ethers, deployments, network }) => {
    const { ensHolder } = await getNamedAccounts();
    const ensHolderSigner = ethers.provider.getSigner(ensHolder);

    const ensRegistryAddress =
      network === "31337" ? (await deployments.get("ENSRegistry")).address : getEnsAddress(network);

    const ensRegistry = new ethers.Contract(ensRegistryAddress, ENSRegistry, ensHolderSigner);

    const { address: podEnsRegistrarAddress } = await deployments.get("PodEnsRegistrar");

    // approve podENSRegistry to make pod.eth changes on behalf of ensHolder
    await ensRegistry.setApprovalForAll(podEnsRegistrarAddress, true);

    console.log(`Set ${ensHolder} approvalForAll for ${podEnsRegistrarAddress} with ens ${ensRegistry.address}`);
  });

task("update-registrar", "upgrade controller to new registrar").setAction(
  async (args, { getNamedAccounts, ethers, artifacts }) => {
    const { deployer } = await getNamedAccounts();
    const deployerSigner = ethers.provider.getSigner(deployer);
    const { address: podEnsRegistrarAddress } = await ethers.getContractAt("PodEnsRegistrar", deployer);

    await (
      await ethers.getContractAtFromArtifact(await artifacts.readArtifact("Controller"), deployerSigner)
    ).updatePodEnsRegistrar(podEnsRegistrarAddress);
    await (
      await ethers.getContractAtFromArtifact(await artifacts.readArtifact("ControllerV1.1"), deployerSigner)
    ).updatePodEnsRegistrar(podEnsRegistrarAddress);
    await (
      await ethers.getContractAtFromArtifact(await artifacts.readArtifact("ControllerV1.2"), deployerSigner)
    ).updatePodEnsRegistrar(podEnsRegistrarAddress);
    await (
      await ethers.getContractAtFromArtifact(await artifacts.readArtifact("ControllerV1.3"), deployerSigner)
    ).updatePodEnsRegistrar(podEnsRegistrarAddress);
  },
);

task("ens-approve-registrar", "upgrade controller to new registrar").setAction(
  async (args, { getNamedAccounts, getChainId, ethers, deployments, artifacts }) => {
    const { deployer } = await getNamedAccounts();
    const network = await getChainId();
    const deployerSigner = ethers.provider.getSigner(deployer);
    const permissionManager = await ethers.getContractAtFromArtifact(
      await artifacts.readArtifact("PermissionManager"),
      deployerSigner,
    );

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
  .setAction(async (args, { getChainId, ethers, artifacts, getNamedAccounts }) => {
    const { deployer } = await getNamedAccounts();
    const deployerSigner = ethers.provider.getSigner(deployer);

    const IController = require("./artifacts/contracts/interfaces/IControllerV1.sol/IControllerV1.json");

    const { startPod, endPod } = args;
    const network = await getChainId();
    const ens = new ENS({ provider: ethers.provider, ensAddress: getEnsAddress(network) });

    const { address: newRegistrar } = await ethers.getContractAtFromArtifact(
      await artifacts.readArtifact("PodEnsRegistrar"),
      deployerSigner,
    );
    const memberToken = await ethers.getContractAtFromArtifact(
      await artifacts.readArtifact("MemberToken"),
      deployerSigner,
    );
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
  .setAction(async (args, { getChainId, ethers, artifacts }) => {
    const { startPod, endPod } = args;
    const network = await getChainId();
    const ens = new ENS({ provider: ethers.provider, ensAddress: getEnsAddress(network) });
    const controller = await ethers.getContractAtFromArtifact(await artifacts.readArtifact("Controller"));
    const ensRegistrar = await ethers.getContractAtFromArtifact(await artifacts.readArtifact("PodEnsRegistrar"));

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
  .addParam("newOwner")
  .setAction(async (args, { getNamedAccounts, ethers, artifacts }) => {
    const { newOwner } = args;
    const { deployer } = await getNamedAccounts();
    const deployerSigner = ethers.provider.getSigner(deployer);

    const Permissions = await ethers.getContractAtFromArtifact(
      await artifacts.readArtifact("PermissionManager"),
      deployerSigner,
    );
    const adminRole = await Permissions.DEFAULT_ADMIN_ROLE();
    // await Permissions.grantRole(adminRole, newOwner);
    const hasRole = await Permissions.hasRole(adminRole, newOwner);
    if (hasRole) console.log("Granted permission successfully");
    else console.log("Failed to grant permission");
  });

task("migrate-permissions", "migrates contract owners to the Permissions contract").setAction(
  async (args, { getNamedAccounts, ethers, deployments, artifacts }) => {
    const { deployer } = await getNamedAccounts();
    const deployerSigner = ethers.provider.getSigner(deployer);

    const { address: permissionsAddress } = await deployments.get("PermissionManager");

    const contract = await ethers.getContractAtFromArtifact(
      await artifacts.readArtifact("ControllerV1.4"),
      deployerSigner,
    );
    await contract.transferOwnership(permissionsAddress);
  },
);

task("migrate-ens-owner", "change owner of the ENS TLD").setAction(
  async (args, { getChainId, getNamedAccounts, ethers, deployments, artifacts }) => {
    const { deployer } = await getNamedAccounts();
    const network = await getChainId();
    const deployerSigner = ethers.provider.getSigner(deployer);

    const { address: permissionsAddress } = await ethers.getContractAtFromArtifact(
      await artifacts.readArtifact("PermissionManager"),
      deployerSigner,
    );
    const ensRegistryAddress =
      network === "31337" ? (await deployments.get("ENSRegistry")).address : getEnsAddress(network);

    const ensRegistry = new ethers.Contract(ensRegistryAddress, ENSRegistry, deployerSigner);
    const tld = network === "1" ? "xyz" : "eth";
    await ensRegistry.setOwner(ethers.utils.namehash(`pod.${tld}`), permissionsAddress);
  },
);

task("test-ens", "tests to see if ENS works via our Permissions contract").setAction(
  async (args, { getNamedAccounts, ethers, artifacts }) => {
    const { deployer } = await getNamedAccounts();
    const deployerSigner = ethers.provider.getSigner(deployer);

    const Permissions = await ethers.getContractAtFromArtifact(
      await artifacts.readArtifact("PermissionManager"),
      deployerSigner,
    );

    const PodEnsRegistrar = await ethers.getContract("PodEnsRegistrar", deployer);
    const { data } = await PodEnsRegistrar.populateTransaction.setText(
      ethers.utils.namehash("yourmoms.pod.eth"),
      "butt",
      "butt",
    );

    await Permissions.callAsOwner(PodEnsRegistrar.address, data);
  },
);

task("permissions-transfer-owner-out", "transfers owner role out of permissions contract")
  .addParam("contractAddress", "address of ownable contract")
  .addParam("toAddress", "address sending owner role to")
  .setAction(async (args, { getNamedAccounts, ethers, artifacts }) => {
    const { deployer } = await getNamedAccounts();
    const deployerSigner = ethers.provider.getSigner(deployer);

    if (args.toAddress === ethers.constants.AddressZero || !args.toAddress) {
      console.log("toAddress cannot be zero");
      return;
    }

    const ownableContract = new ethers.Contract(
      args.contractAddress,
      ["function transferOwnership(address newOwner) public", "function owner() public view returns (address)"],
      deployerSigner,
    );

    const Permissions = await ethers.getContractAtFromArtifact(
      await artifacts.readArtifact("PermissionManager"),
      "0x922A37bb4B8A155a916c15c69345731613381870",
      deployerSigner,
    );

    const { data } = await ownableContract.populateTransaction.transferOwnership(args.toAddress);

    await Permissions.callAsOwner(args.contractAddress, data);

    const newOwner = await ownableContract.owner();
    console.log(`Transferred ownership of ${args.contractAddress} to ${newOwner}`);
  });

task("get-owner", "gets owner of contract")
  .addParam("contractAddress", "address of ownable contract")
  .setAction(async (args, { getNamedAccounts, ethers }) => {
    const { deployer } = await getNamedAccounts();
    const deployerSigner = ethers.provider.getSigner(deployer);

    const ownableContract = new ethers.Contract(
      args.contractAddress,
      ["function owner() public view returns (address)"],
      deployerSigner,
    );
    const owner = await ownableContract.owner();
    console.log(`Owner: ${owner}`);
  });
