// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.7;

import "forge-std/Test.sol";
import "forge-std/console.sol";
import "../../contracts/ControllerRegistry.sol";
import "../../contracts/PermissionManager.sol";

contract PermissionsMainnetTest is Test {
    ControllerRegistry registry =
        ControllerRegistry(0x0d97643EE1051B523E4e3b66Df3640bBA6C0F79f);
    PermissionManager permissions = new PermissionManager();
    address originalOwner = registry.owner();
    string url =
        "https://rinkeby.infura.io/v3/69ecf3b10bc24c6a972972666fe950c8";
    uint256 currentBlock = block.number;
    address testAddress = address(0x1337);

    function setUp() public {
        // console.log(originalOwner);
        // vm.rollFork(currentBlock);
        // PermissionManager actualManager = PermissionManager(registry.owner());
        // vm.prank(originalOwner);
        // actualManager.callAsOwner(
        //     address(registry),
        //     abi.encodeWithSignature("transferOwnership(address)", testAddress)
        // );
        // This sets the owner of the registry to our test address.
    }

    function test_callAsOwner() public {
        // Transfer the existing mainnet contract to the PermissionManager contract.
        vm.prank(originalOwner);
        registry.transferOwnership(address(permissions));

        // Call the PermissionManager contract to register the ControllerRegistry contract.
        permissions.callAsOwner(
            address(registry),
            abi.encodeWithSignature("registerController(address)", testAddress)
        );
        assertEq(registry.isRegistered(testAddress), true);
    }

    // Attempt to make a call when Permission is not owner of Registry should fail.
    function test_callAsOwnerFail() public {
        vm.expectRevert("call failed");
        permissions.callAsOwner(
            address(registry),
            abi.encodeWithSignature("registerController(address)", testAddress)
        );
    }

    /**
      Fail when Permissions is the owner of Registry, but caller doesn't have the appropriate role.
     */
    function test_callAsOwnerButNotOwner() public {
        // Transfer the existing mainnet contract to the PermissionManager contract.
        vm.prank(originalOwner);
        registry.transferOwnership(address(permissions));

        // 1338 is not an owner of the PermissionManager contract, so this should throw.
        vm.prank(address(0x1338));
        vm.expectRevert(
            "AccessControl: account 0x0000000000000000000000000000000000001338 is missing role 0x0000000000000000000000000000000000000000000000000000000000000000"
        );
        permissions.callAsOwner(
            address(registry),
            abi.encodeWithSignature("registerController(address)", testAddress)
        );
    }

    /**
      Assign an additional owner to the Registry and see if they can make the appropriate call.
     */
    function test_assignAdditionalOwner() public {
        vm.prank(originalOwner);
        registry.transferOwnership(address(permissions));
        permissions.grantRole(
            0x0000000000000000000000000000000000000000000000000000000000000000,
            address(0x1338)
        );

        vm.prank(address(0x1338));
        permissions.callAsOwner(
            address(registry),
            abi.encodeWithSignature("registerController(address)", testAddress)
        );
        assertEq(registry.isRegistered(testAddress), true);
    }

    /**
      Should be able to remove other owners
     */
    function test_removeOwner() public {
        permissions.grantRole(
            0x0000000000000000000000000000000000000000000000000000000000000000,
            address(0x1338)
        );
        vm.prank(address(0x1338));
        permissions.revokeRole(
            0x0000000000000000000000000000000000000000000000000000000000000000,
            testAddress
        );
    }

    /**
        Should be able to migrate to a new Permissions contract.
     */
    function test_migratePermissions() public {
        console.log(originalOwner);
        console.log(registry.owner());

        vm.prank(originalOwner);
        registry.transferOwnership(address(permissions));

        permissions.callAsOwner(
            address(registry),
            abi.encodeWithSignature("registerController(address)", testAddress)
        );
        permissions.grantRole(
            0x0000000000000000000000000000000000000000000000000000000000000000,
            testAddress
        );
        PermissionManager permissions2 = new PermissionManager();
        vm.prank(testAddress);
        permissions.callAsOwner(
            address(registry),
            abi.encodeWithSignature(
                "transferOwnership(address)",
                address(permissions2)
            )
        );
        // registry.transferOwnership(address(permissions2));
        assertEq(registry.owner(), address(permissions2));
    }
}
