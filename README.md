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

You must link this project with the vercel web environment in order to deploy. Run `npm run vercel-link`, and select "yes", "Orca Protocol", "yes", and "web" when prompted.

You must create `ethKeys.json` in the product root, and it should look like this:

```json
// This should be your private key
{
  "account1": "0x112345..."
}
```

### Deploying

You can run `npm run deploy-rinkeby` to deploy contracts to the testnet. This will deploy all our contracts and connect them to the official Gnosis Safe contracts.

This will also overwrite the vercel web environment variables with the new contract addresses. Remember to create a new deployment if it seems like they didn't update.
