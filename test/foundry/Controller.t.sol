// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.7;

import "forge-std/Test.sol";
import "../../contracts/ControllerV1.sol";
import "../../contracts/MemberToken.sol";
import "../../contracts/SafeTeller.sol";
import "../../contracts/ens/IPodEnsRegistrar.sol";
import "../../contracts/interfaces/IControllerRegistry.sol";
import "../mocks/MockReverseRegistrar.sol";

contract ControllerV1Test is Test {
    address mockDependency = address(0x1337);
    address mockPodEnsRegistrar = address(0x1339);
    address mockControllerRegistry = address(0x1340);

    MemberToken memberToken = new MemberToken(mockControllerRegistry, "uri");
    ControllerV1 controller =
        new ControllerV1(
            address(memberToken),
            mockControllerRegistry,
            mockDependency,
            mockDependency,
            mockPodEnsRegistrar,
            mockDependency
        );

    // we should be testing revert on each Dependency
    function test_Constructor() public {
        address[6] memory mockDependencies = [
            mockDependency,
            mockDependency,
            mockDependency,
            mockDependency,
            mockDependency,
            mockDependency
        ];
        // check each dependency fails when using address(0)
        for (uint256 i = 0; i < mockDependencies.length; i++) {
            // override w address(0)
            mockDependencies[i] = address(0);
            vm.expectRevert("Invalid address");
            new ControllerV1(
                mockDependencies[0],
                mockDependencies[1],
                mockDependencies[2],
                mockDependencies[3],
                mockDependencies[4],
                mockDependencies[5]
            );
            // reset
            mockDependencies[i] = address(0x1337);
        }
        // TODO: test dependancies getting set
    }
}
