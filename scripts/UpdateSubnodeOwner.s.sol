// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.6.0 <0.9.0;

import "forge-std/Script.sol";
import "./SubnodeOwnerMigrator.sol";

contract UpdateSubnodeOwner is Script {
    function run(bytes32[] calldata labelhashes, address newRegistrar)
        external
    {
        vm.startBroadcast();
        SubnodeOwnerMigrator migrator = new SubnodeOwnerMigrator();
        migrator.migrateRegistrar(labelhashes, newRegistrar);
        vm.stopBroadcast();
    }
}
