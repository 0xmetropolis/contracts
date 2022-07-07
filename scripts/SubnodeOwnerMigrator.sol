// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.6.0 <0.9.0;

import "../contracts/ens/PodEnsRegistrar.sol";

contract SubnodeOwnerMigrator {
    PodEnsRegistrar oldRegistrar =
        PodEnsRegistrar(0xfb015352De6E5876C6B103724Ef023a6bF4D16B4);

    function migrateRegistrar(
        bytes32[] calldata labelhashes,
        address newRegistrar
    ) public {
        ENS ens = ENS(oldRegistrar.ens());
        bytes32 node = oldRegistrar.getRootNode();
        // Get the root (we can do this off chain too)
        // Get the ENSRegistry (is this the same thing as registrar?)
        for (uint256 i = 0; i < labelhashes.length; i++) {
            ens.setSubnodeOwner(node, labelhashes[i], newRegistrar);
        }
    }
}
