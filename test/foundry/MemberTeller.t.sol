pragma solidity ^0.8.7;

import "forge-std/Test.sol";
import "../mocks/MockMemberToken.sol";
import "../../contracts/MemberTeller.sol";

contract MemberTellerInternalTest is Test, MemberTeller {
    MockMemberToken mockMemberToken = new MockMemberToken();
    address ALICE = address(0x1337);
    address BOB = address(0x1338);

    constructor() MemberTeller(address(mockMemberToken)) {}

    function test_OwnerManagement() public {
        mockMemberToken.mint(ALICE, 1, "");
        {
            // add signer payload
            bytes memory txData = abi.encodeWithSignature(
                "addOwnerWithThreshold(address,uint256)",
                address(BOB),
                1
            );

            memberTellerCheck(1, txData);
            assertEq(mockMemberToken.balanceOf(BOB, 1), 1);
        }
        {
            // remove signer payload
            bytes memory txData = abi.encodeWithSignature(
                "removeOwner(address,address,uint256)",
                address(0xc7BDD438CbEd7701DA476aeBec99cF2Db4d65bb7), // sentinal address
                address(BOB),
                1
            );

            memberTellerCheck(1, txData);
            assertEq(mockMemberToken.balanceOf(BOB, 1), 0);
        }
        {
            // transfer signer payload
            bytes memory txData = abi.encodeWithSignature(
                "swapOwner(address,address,address)",
                address(0xc7BDD438CbEd7701DA476aeBec99cF2Db4d65bb7), // sentinal address
                address(ALICE),
                address(BOB)
            );

            memberTellerCheck(1, txData);
            assertEq(mockMemberToken.balanceOf(ALICE, 1), 0);
            assertEq(mockMemberToken.balanceOf(BOB, 1), 1);
        }
    }

    // TODO: test burn sync flag
    // should not get called on ad owner
    // should get called on memberTeller check
}
