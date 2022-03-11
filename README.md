# Orca Protocol

Orca Protocol is a lightweight permissions and membership management protocol that can be connected to Gnosis Safe through the `SafeTeller.sol` safe module.

Each membership group within orca is referred to as a pod and pod memberships are represented by ERC1155 membership tokens.

## Library Usage

The NPM package includes some convenience functions for fetching deployments:

```js
import { getDeployment, getControllerByAddress } from "@orcaprotocol/contracts";

// Fetches the latest Controller from the mainnet
const controller = getDeployment("ControllerLatest", 1);
// Fetching and instantiating the MemberToken contract
const memberTokenDeployment = getDeployment("MemberToken", network);
const MemberToken = new ethers.Contract(memberTokenDeployment.address, memberTokenDeployment.abi, provider);

// You can also fetch the Controller version by the address of the deployment.
// This is useful for fetching Controllers from Pods, as different Pod versions
// have different Controllers

// The Controller address tracked on the MemberToken
const controllerAddress = await MemberToken.memberController(id);
if (controllerAddress === ethers.constants.AddressZero) {
  throw new Error("Pod ID was not registered on Controller");
}

const controllerDeployment = getControllerByAddress(controllerAddress, network);
const Controller = new ethers.Contract(controllerDeployment.address, controllerDeployment.abi, provider);
```

###

## Development

### Getting Started

Run `npm install`

### Testing

Run `npm run test` to run the test suite

Run `npm run coverage` to print a coverage report

## Deployment

### Pre-Reqs

You must create `.env` in the product root, and it should look like this:

```
// This should be your private key
PRIVATE_KEY = ""

COINMARKETCAP_KEY= ""

INFURA_API_KEY= ""
```

### Deploying

You can run `npx hardhat --network rinkeby deploy` to deploy contracts to the testnet. This will deploy all our contracts and connect them to the official Gnosis Safe contracts.

Run `npx hardhat etherscan-verify` to verify contracts on etherscan

Run `npx hardhat tenderly-verify` to verify contracts on tenderly

## Architecture

The high level architecture of orca protocol is a permission wrapper around a gnosis safe that uses 1155 NFT membership to manage access.

A gnosis safe wrapped by orca is referred to as a pod.

### Member Token

The `MemberToken` is an 1155 token contract that represents manages the memberships of all pods.

Each pod is represented by a unique 1155 token `id`, which correspond to its set of member NFTs.

Each pod also is tied to a version of the `Controller`, for future upgradeability.

On any token event the `_beforeTokenTransfer` hook will call the `beforeTokenTransfer` function of the pod's version of `Controller` to perform validation and manage side effects before the token is allowed to transfer.

### Controller

The `Controller` manages the creation of pods as well as managing their membership validation and side effects.

When the `MemberToken` calls the `beforeTokenTransfer` function, the `Controller` will validate the action with the `RuleManager` to verify the membership change is permissible.

If the event is permissible the `Controller` will call the `SafeTeller` to handle the side effects of the membership change.

### RuleManager

The `RuleManager` manages the rules for multiple pods, each rule is an arbitrary transaction that returns `true` or `false` based on a member's compliance at transfer time

### SafeTeller

The `SafeTeller` manages the side effects for multiple pods, before a valid token transfer the `SafeTeller` will perform owner updates to the pod's safe
