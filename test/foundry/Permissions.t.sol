// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.7;

import "forge-std/Test.sol";
import "../../contracts/ControllerRegistry.sol";
import "../../contracts/Permissions.sol";

contract PermissionsTest is Test {
    ControllerRegistry registry = new ControllerRegistry();
    Permissions permissions = new Permissions();

    function setUp() public {
        permissions = new Permissions();
        registry = new ControllerRegistry();
    }

    function test_callAsOwner() public {
        registry.transferOwnership(address(permissions));

        permissions.callAsOwner(
            address(registry),
            abi.encodeWithSignature(
                "registerController(address)",
                address(0x1337)
            )
        );
        assertEq(registry.isRegistered(address(0x1337)), true);
    }

    // Attempt to make a call when Permission is not owner of Registry should fail.
    function test_callAsOwnerFail() public {
        vm.expectRevert("call failed");
        permissions.callAsOwner(
            address(registry),
            abi.encodeWithSignature(
                "registerController(address)",
                address(0x1337)
            )
        );
    }

    /**
      Fail when Permissions is the owner of Registry, but caller doesn't have the appropriate role.
     */
    function test_callAsOwnerButNotOwner() public {
        registry.transferOwnership(address(permissions));

        vm.prank(address(0x1338));
        vm.expectRevert(
            "AccessControl: account 0x0000000000000000000000000000000000001338 is missing role 0x0000000000000000000000000000000000000000000000000000000000000000"
        );
        permissions.callAsOwner(
            address(registry),
            abi.encodeWithSignature(
                "registerController(address)",
                address(0x1337)
            )
        );
    }

    /**
      Assign an additional owner to the Registry and see if they can make the appropriate call.
     */
    function test_assignAdditionalOwner() public {
        registry.transferOwnership(address(permissions));
        permissions.grantRole(
            0x0000000000000000000000000000000000000000000000000000000000000000,
            address(0x1338)
        );

        vm.prank(address(0x1338));
        permissions.callAsOwner(
            address(registry),
            abi.encodeWithSignature(
                "registerController(address)",
                address(0x1337)
            )
        );
        assertEq(registry.isRegistered(address(0x1337)), true);
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
            address(0x1337)
        );
    }
}
