## Orca Protocol 

Orca Protocol is a lightweight permissions and membership management protocol that can be connected to Gnosis Safe through the `SafeTeller.sol` safe module.
Each membership group within orca is referred to as a pod and pod memberships are represented by ERC1155 membership tokens.

## Development

### Getting Started 

run `npm install` 

### Testing

run `npm run test`
## Deployment

### Pre-Reqs

You must create `.env` in the product root, and it should look like this:

```json
// This should be your private key
RINKEBY_PK = ""

COINMARKETCAP_KEY= ""

INFURA_URL_RINKEBY= ""
```

### Deploying

You can run `npx hardhat --network rinkeby deploy` to deploy contracts to the testnet. This will deploy all our contracts and connect them to the official Gnosis Safe contracts.
