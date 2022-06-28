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

    function setUp() public {
        vm.mockCall(
            mockControllerRegistry,
            abi.encodeWithSelector(IControllerRegistry.isRegistered.selector),
            abi.encode(true)
        );
        // mock ens calls
        address reverseResolver = address(0x1341);
        vm.mockCall(
            mockPodEnsRegistrar,
            abi.encodeWithSelector(IPodEnsRegistrar.registerPod.selector),
            abi.encode(reverseResolver)
        );
        vm.mockCall(
            reverseResolver,
            abi.encodeWithSelector(MockReverseRegistrar.setName.selector),
            abi.encode(true)
        );
    }

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

    // CREATE POD TESTS
    // // should create pod without an admin
    // function test_CreatePod() public {
    //     uint256 podId = 1;

    //     address[] memory members = new address[](1);
    //     members[0] = address(0x1341);
    //     controller.createPod(
    //         members,
    //         1,
    //         address(0), // no admin
    //         bytes32("label"),
    //         string("ens"),
    //         podId,
    //         string("imageId")
    //     );

    //     assertEq(address(controller), memberToken.memberController(podId));
    // }
}

contract ControllerV1InternalTest is Test, ControllerV1 {
    address mockDependency = address(0x1337);
    address mockPodEnsRegistrar = address(0x1339);
    address mockControllerRegistry = address(0x1340);

    MemberToken memberTokenContract =
        new MemberToken(mockControllerRegistry, "uri");

    constructor()
        ControllerV1(
            address(memberTokenContract),
            mockControllerRegistry,
            mockDependency,
            mockDependency,
            mockPodEnsRegistrar,
            mockDependency
        )
    {}

    // mock setupSafe function
    function setupSafeReverseResolver(
        address safe,
        address reverseRegistrar,
        string memory _ensString
    ) internal override {
        //nothing
    }

    function setUp() public {
        vm.mockCall(
            mockControllerRegistry,
            abi.encodeWithSelector(IControllerRegistry.isRegistered.selector),
            abi.encode(true)
        );
        // mock ens calls
        // need to add contract data at location for certain mocked calls
        vm.etch(mockPodEnsRegistrar, abi.encode(0x111111111111111111));

        address reverseResolver = address(0x1341);
        vm.mockCall(
            mockPodEnsRegistrar,
            abi.encodeWithSelector(IPodEnsRegistrar.registerPod.selector),
            abi.encode(reverseResolver)
        );
        vm.mockCall(
            mockPodEnsRegistrar,
            abi.encodeWithSelector(IPodEnsRegistrar.getEnsNode.selector),
            abi.encode(bytes32("node"))
        );
        vm.mockCall(
            mockPodEnsRegistrar,
            abi.encodeWithSelector(IPodEnsRegistrar.setText.selector),
            abi.encode()
        );
    }

    // should creat pod with no admin
    function test_CreatePodNoAdmin() public {
        uint256 podId = 0;

        address[] memory members = new address[](1);
        members[0] = address(0x1342);

        address safe = address(0x1343);

        super._createPod(
            members,
            safe,
            address(0), // admin
            bytes32("label"),
            "ensString",
            podId,
            "imageUrl"
        );
        // check controller state is set
        assertEq(safe, podIdToSafe[podId]);
        assertEq(podId, safeToPodId[safe]);
        assertFalse(areModulesLocked[safe]);
        // check membertoken state is set
        assertEq(address(this), memberTokenContract.memberController(podId));
    }

    // should create pod with admin
    function test_CreatePodWithAdmin() public {
        uint256 podId = 0;

        address[] memory members = new address[](1);
        members[0] = address(0x1342);

        address safe = address(0x1343);
        address admin = address(0x1344);
        super._createPod(
            members,
            safe,
            admin,
            bytes32("label"),
            "ensString",
            podId,
            "imageUrl"
        );
        // check controller state is set
        assertEq(admin, podAdmin[podId]);
    }

    // function test_CreatePodWithAdmin() public {
    //     uint256 podId = 0;

    //     address[] memory members = new address[](1);
    //     members[0] = address(0x1342);

    //     address safe = address(0x1343);
    //     address admin = address(0x1344);
    //     super._createPod(
    //         members,
    //         safe,
    //         admin,
    //         bytes32("label"),
    //         "ensString",
    //         podId,
    //         "imageUrl"
    //     );
    //     // check controller state is set
    //     assertEq(safe, podIdToSafe[podId]);
    //     assertEq(podId, safeToPodId[safe]);
    //     assertEq(admin, podAdmin[podId]);
    //     assertTrue(areModulesLocked[safe]);
    //     // check membertoken state is set
    //     assertEq(address(this), memberTokenContract.memberController(podId));
    // }
}
