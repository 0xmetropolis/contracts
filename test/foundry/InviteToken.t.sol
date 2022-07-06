// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.7;

import "forge-std/Test.sol";
import "../../contracts/InviteToken.sol";

contract InviteTokenTest is Test {
    InviteToken inviteToken;
    address ALICE = address(0x1337);
    address BOB = address(0x1338);

    function setUp() public {
        inviteToken = new InviteToken();
    }

    function test_InitialRoles() public {
        // check MINTER_ROLE set
        assertTrue(
            inviteToken.hasRole(inviteToken.MINTER_ROLE(), address(this))
        );
        // check BURNER_ROLE set
        assertTrue(
            inviteToken.hasRole(inviteToken.BURNER_ROLE(), address(this))
        );
        // check DEFAULT_ADMIN_ROLE set
        assertTrue(
            inviteToken.hasRole(inviteToken.DEFAULT_ADMIN_ROLE(), address(this))
        );
    }

    function test_MintAndBurn() public {
        // check that minter can mint
        inviteToken.mint(ALICE, 1);
        assertEq(inviteToken.balanceOf(ALICE), 1);
        // check that burner can burn
        inviteToken.burn(ALICE, 1);
        assertEq(inviteToken.balanceOf(ALICE), 0);
    }

    function test_BatchMint() public {
        address[] memory addresses = new address[](2);
        addresses[0] = ALICE;
        addresses[1] = BOB;

        inviteToken.batchMint(addresses, 1);

        assertEq(inviteToken.balanceOf(ALICE), 1);
        assertEq(inviteToken.balanceOf(BOB), 1);
    }

    function testFail_MintAuth(address randAddress) public {
        vm.assume(randAddress != address(this));
        vm.prank(randAddress);
        // should throw on bad mint
        inviteToken.mint(ALICE, 1);
    }

    function testFail_BurnAuth(address randAddress) public {
        vm.assume(randAddress != address(this));
        inviteToken.mint(ALICE, 1);
        vm.prank(randAddress);
        // should throw on bad burn
        inviteToken.burn(ALICE, 1);
    }
}
