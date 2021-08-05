# Orca Protocol

TODO

## Contracts

### Controller

The Controller contract is the outward facing contract, most, if not all, public facing functions should go through the Controller contract, including things like pod creation, the shepherd functions, etc.

When deploying the Controller will also need to be linked to all of it's dependency contracts, which are as follows:

### PowerBank

This is called ONLY through `Controller`

This contract handles logic around claiming and retracting membership based on rules defined in `RuleManager`. The membership status itself is represented by 1155 tokens as defined in `PowerBank`.

### PowerToken

TODO: Might want to reimplement 1155 rather than inherit to get around the approval requirements

1155 contract responsible for handling membership.

The token types correspond to pods, and the fungible tokens within those types correspond to membership.

This contract should only be called through `PowerBank`, with the exception of `setApprovalForAll`, which needs to be called by the token owner to allow the `PowerBank` as an operator.

Rules around membership:

- Users cannot own more than one token
- Users _must_ delegate the contract's `podManager` as an approver for all
- Users cannot remove the `podManager` as an approver or their tokens will be locked
- Users are unable to move their own tokens
- Users must remain in compliance with the rules set in RuleManager, or their tokens can be revoked at any time.

### RuleManager

TODO: Only called through PowerBank?

Stores rules that a pod must be in compliance with, as well as logic for amending existing rules.

### OrcaToken

TODO

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
