const { ethers } = require('hardhat');
const { getSafeSingletonDeployment, getProxyFactoryDeployment } = require('@gnosis.pm/safe-deployments');

const setup = async () => {
  const [signer] = await ethers.getSigners();

  // Rinkeby network ID is 4
  const gnosisSafe = getSafeSingletonDeployment({ network: 4 });
  const { defaultAddress: gnosisSafeAddress } = gnosisSafe;
  const proxyFactory = getProxyFactoryDeployment({ network: 4 });
  const { defaultAddress: proxyFactoryAddress } = proxyFactory;

  // Fetch factories
  const MemberToken = await ethers.getContractFactory('MemberToken', signer);
  const SafeTeller = await ethers.getContractFactory('SafeTeller', signer);
  const RuleManager = await ethers.getContractFactory('RuleManager', signer);
  const Controller = await ethers.getContractFactory('Controller', signer);

  const memberToken = await MemberToken.deploy();
  const safeTeller = await SafeTeller.deploy();
  const ruleManager = await RuleManager.deploy();

  const controller = await Controller.deploy(memberToken.address, ruleManager.address, safeTeller.address);

  await memberToken.updateController(controller.address);
  await safeTeller.updateController(controller.address);

  await safeTeller.updateSafeAddresses(proxyFactoryAddress, gnosisSafeAddress, { gasLimit: 4000000 });

  return { memberToken, safeTeller, ruleManager, controller };
};

async function main() {
  const { memberToken, safeTeller, ownerToken, ruleManager, controller } = await setup();
  console.log('memberToken.address', memberToken.address);
  console.log('safeTeller.address', safeTeller.address);
  console.log('ownerToken.address', ownerToken.address);
  console.log('ruleManager.address', ruleManager.address);
  console.log('controller.address', controller.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
