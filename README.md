# Orca Protocol

TODO

## Contracts

### OrcaProtocol

TODO: Can we get rid of this and roll its functionality into PodManager?

The OrcaProtocol contract is the outward facing contract, most, if not all, public facing functions should go through the OrcaProtocol contract, including things like pod creation, the shepherd functions, etc.

Deploying the OrcaProtocol will also deploy all of its necessary contracts, which are as follows:

### PodManager

TODO: Unclear if this should be called directly or only through `OrcaProtocol`

This contract handles logic around claiming and retracting membership based on rules defined in `RuleManager`. The membership status itself is represented by 1155 tokens as defined in `MemberToken`.

### MemberToken

TODO: Might want to reimplement 1155 rather than inherit to get around the approval requirements

1155 contract responsible for handling membership.

The token types correspond to pods, and the fungible tokens within those types correspond to membership.

This contract should only be called through `PodManager`, with the exception of `setApprovalForAll`, which needs to be called by the token owner to allow the `PodManager` as an operator.

Rules around membership:

- Users cannot own more than one token
- Users _must_ delegate the contract's `podManager` as an approver for all
- Users cannot remove the `podManager` as an approver or their tokens will be locked
- Users are unable to move their own tokens
- Users must remain in compliance with the rules set in RuleManager, or their tokens can be revoked at any time.

### RuleManager

TODO: Only called through PodManager?

Stores rules that a pod must be in compliance with, as well as logic for amending existing rules.

### OrcaToken

TODO
