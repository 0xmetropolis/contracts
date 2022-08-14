// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.7;

import "forge-std/Test.sol";
import "forge-std/console.sol";
import "../../contracts/ControllerV1.sol";
import "../../contracts/MemberToken.sol";
import "../../contracts/ens/IPodEnsRegistrar.sol";
import "../../contracts/interfaces/IControllerRegistry.sol";
import "../mocks/MockReverseRegistrar.sol";
import "../mocks/MockProxyFactory.sol";
import "../mocks/MockSafe.sol";
import "../mocks/MockMemberToken.sol";
import "../mocks/MockPodEnsRegistrar.sol";
import "../mocks/MockControllerRegistry.sol";
import "../mocks/MockResolver.sol";
import {Enum} from "safe-contracts/base/GuardManager.sol";

contract ControllerV1Test is Test {
    address mockDependency = address(0x1337);
    address mockGnosisMaster = address(0x1340);
    address mockFallbackHandler = address(0x1342);

    MockControllerRegistry mockControllerRegistry =
        new MockControllerRegistry();
    MockPodEnsRegistrar mockPodEnsRegistrar = new MockPodEnsRegistrar();
    MockReverseRegistrar mockReverseRegistrar = new MockReverseRegistrar();
    MockProxyFactory mockProxyFactory = new MockProxyFactory();
    MockMemberToken mockMemberToken = new MockMemberToken();
    MockSafe mockSafe = new MockSafe();
    address mockSafeAddress = address(mockSafe);

    ControllerV1 controller;

    address admin = address(0x1345);

    function getMockMembers() public pure returns (address[] memory) {
        address[] memory members = new address[](2);
        members[0] = address(0x1343);
        members[0] = address(0x1344);
        return members;
    }

    function createPod(bool hasAdmin) public returns (uint256) {
        vm.mockCall(
            address(mockProxyFactory),
            abi.encodeWithSelector(mockProxyFactory.createProxy.selector),
            abi.encode(mockSafeAddress)
        );
        uint256 podId = 0;
        controller.createPod(
            getMockMembers(),
            1,
            hasAdmin ? admin : address(0),
            bytes32(" "),
            string(" "),
            podId,
            string(" ")
        );

        return (podId);
    }

    function createController() public returns (address) {
        ControllerV1 newController = new ControllerV1(
            address(0x1738),
            address(mockMemberToken),
            address(mockControllerRegistry),
            address(mockProxyFactory),
            mockGnosisMaster,
            address(mockPodEnsRegistrar),
            mockFallbackHandler
        );
        return address(newController);
    }

    function setUp() public {
        controller = new ControllerV1(
            address(0x1738),
            address(mockMemberToken),
            address(mockControllerRegistry),
            address(mockProxyFactory),
            mockGnosisMaster,
            address(mockPodEnsRegistrar),
            mockFallbackHandler
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
                address(0x1738),
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
    }

    // CREATE POD WITH SAFE TESTS
    // check no zero safe
    // check safe already exists - call create Pod
    // check not isSafeModuleEnabled - mock
    // check not safe member - mock
    // check is safe
    function test_createPodWithBadSafe() public {
        vm.expectRevert("invalid safe address");
        controller.createPodWithSafe(
            address(0x1337),
            address(0), // bad safe
            bytes32(" "),
            string(" "),
            1,
            string(" ")
        );
    }

    function test_createPodWithExistingPodSafe() public {
        // should revert on 0 id in use
        controller.createPodWithSafe(
            address(0x1337),
            mockSafeAddress, // existing pod safe
            bytes32(" "),
            string(" "),
            0,
            string(" ")
        );
        vm.expectRevert("safe already in use");
        controller.createPodWithSafe(
            address(0x1337),
            mockSafeAddress, // existing pod safe
            bytes32(" "),
            string(" "),
            0,
            string(" ")
        );
        // should revert on non 0 id in use
        vm.mockCall(
            address(mockMemberToken),
            abi.encodeWithSelector(mockMemberToken.createPod.selector),
            abi.encode(1)
        );
        address mockSafeAddress2 = address(new MockSafe());
        controller.createPodWithSafe(
            address(0x1337),
            mockSafeAddress2, // existing pod safe
            bytes32(" "),
            string(" "),
            1,
            string(" ")
        );
        vm.expectRevert("safe already in use");
        controller.createPodWithSafe(
            address(0x1337),
            mockSafeAddress2, // existing pod safe
            bytes32(" "),
            string(" "),
            1,
            string(" ")
        );
    }

    function test_createPodWithExistingNoModuleEnabled() public {
        vm.mockCall(
            mockSafeAddress,
            abi.encodeWithSelector(mockSafe.isModuleEnabled.selector),
            abi.encode(false)
        );
        vm.expectRevert("safe module must be enabled");
        controller.createPodWithSafe(
            address(0x1337),
            mockSafeAddress,
            bytes32(" "),
            string(" "),
            0, // pod id
            string(" ")
        );
    }

    function test_createPodAsNonMember() public {
        vm.mockCall(
            mockSafeAddress,
            abi.encodeWithSelector(mockSafe.isOwner.selector),
            abi.encode(false)
        );
        vm.expectRevert("caller must be safe or member");
        controller.createPodWithSafe(
            address(0x1337),
            mockSafeAddress,
            bytes32(" "),
            string(" "),
            0, // pod id
            string(" ")
        );
    }

    function test_createPodAsSafe() public {
        vm.mockCall(
            mockSafeAddress,
            abi.encodeWithSelector(mockSafe.isOwner.selector),
            abi.encode(false)
        );
        vm.prank(mockSafeAddress);
        controller.createPodWithSafe(
            address(0x1337),
            mockSafeAddress,
            bytes32(" "),
            string(" "),
            0, // pod id
            string(" ")
        );
        assertEq(controller.podIdToSafe(0), mockSafeAddress);
    }

    // CREATE POD TESTS
    // check pod id doesnt match - mock membertoken
    function test_createPodBadId() public {
        vm.expectRevert("pod id didn't match, try again");
        controller.createPod(
            getMockMembers(),
            1,
            address(0),
            bytes32(" "),
            string(" "),
            1, // bad pod id
            string(" ")
        );
    }

    // POD MODULE LOCK TESTS
    // can not set if not admin
    function test_nonAdminCannotSetModuleLock() public {
        uint256 podId = createPod(true);
        vm.expectRevert("Must be admin to set module lock");
        controller.setPodModuleLock(podId, false);
    }

    // UPDATE POD ADMIN TESTS
    // check safe doesn't exist
    // safe can change if no admin
    // safe can't change if admin
    // admin can change
    // if admin is turned off safe module lock turns off
    function test_cantUpdateAdminOnNonExistingPod() public {
        vm.expectRevert("Pod doesn't exist");
        controller.updatePodAdmin(3, address(0));
    }

    function test_canAddAdminFromSafe() public {
        uint256 podId = createPod(false);
        vm.prank(mockSafeAddress);
        controller.updatePodAdmin(podId, admin);
        assertEq(controller.podAdmin(podId), admin);
    }

    function test_cantRemoveAdminFromSafe() public {
        uint256 podId = createPod(true);
        vm.prank(mockSafeAddress);
        vm.expectRevert("Only admin can update admin");
        controller.updatePodAdmin(podId, address(0));
    }

    function test_adminCanUpdateAdmin() public {
        uint256 podId = createPod(true);
        vm.prank(admin);
        controller.updatePodAdmin(podId, address(0));
        assertEq(controller.podAdmin(podId), address(0));
        // if admin is turned off safe module lock turns off
        assertEq(controller.areModulesLocked(mockSafeAddress), false);
    }

    // POD TRANSFER LOCK TEST
    // cant be set by non safe if no admin
    // can be set by safe
    // can be set by admin
    // can be set by safe if admin

    function test_cantSetTransferLockByNonSafe() public {
        uint256 podId = createPod(false);
        vm.expectRevert("Only safe can set transfer lock");
        controller.setPodTransferLock(podId, true);
    }

    function test_setTransferLockFromSafeNoAdmin() public {
        uint256 podId = createPod(false);
        vm.prank(mockSafeAddress);
        controller.setPodTransferLock(podId, true);
        assertEq(controller.isTransferLocked(podId), true);
    }

    function test_setTransferLockFromSafeWithAdmin() public {
        uint256 podId = createPod(true);
        vm.prank(mockSafeAddress);
        controller.setPodTransferLock(podId, true);
        assertEq(controller.isTransferLocked(podId), true);
    }

    function test_setTransferLockFromAdmin() public {
        uint256 podId = createPod(true);
        vm.prank(admin);
        controller.setPodTransferLock(podId, true);
        assertEq(controller.isTransferLocked(podId), true);
    }

    // TEST MIGRATE POD CONTROLLER
    // new controller cant be zero
    // cant migrate to current controller
    // cant migrate to unregistered controller - mock controller registry
    // can be migrated by safe
    //// podAdmin, podId, safe address zeroed
    // can be migrated by admin
    //// podAdmin, podId, safe address zeroed

    function test_migrateControllerWithZeroController() public {
        vm.expectRevert("Invalid address");
        controller.migratePodController(0, address(0), address(0));
    }

    function test_migrateControllerWithCurrentController() public {
        vm.expectRevert("Cannot migrate to same controller");
        controller.migratePodController(0, address(controller), address(0));
    }

    function test_migrateControllerWithUnRegisteredController() public {
        vm.mockCall(
            address(mockControllerRegistry),
            abi.encodeWithSelector(
                mockControllerRegistry.isRegistered.selector
            ),
            abi.encode(false)
        );
        vm.expectRevert("Controller not registered");
        controller.migratePodController(0, address(0x1350), address(0x1));
    }

    function test_migrateControllerWithSafe() public {
        uint256 podId = createPod(false);
        address newController = createController();
        address[] memory mockReturn = new address[](1);
        mockReturn[0] = address(controller);
        vm.mockCall(
            address(mockSafeAddress),
            abi.encodeWithSelector(mockSafe.getModulesPaginated.selector),
            abi.encode(mockReturn)
        );
        vm.prank(mockSafeAddress);
        controller.migratePodController(0, newController, address(0x1));
        assertEq(controller.podAdmin(podId), address(0));
        assertEq(controller.podIdToSafe(podId), address(0));
        assertEq(controller.safeToPodId(mockSafeAddress), 0);
    }

    function test_migrateControllerWithAdmin() public {
        uint256 podId = createPod(true);
        address newController = createController();
        address[] memory mockReturn = new address[](1);
        mockReturn[0] = address(controller);
        vm.mockCall(
            address(mockSafeAddress),
            abi.encodeWithSelector(mockSafe.getModulesPaginated.selector),
            abi.encode(mockReturn)
        );
        vm.prank(admin);
        controller.migratePodController(0, newController, address(0x1));
        assertEq(controller.podAdmin(podId), address(0));
        assertEq(controller.podIdToSafe(podId), address(0));
        assertEq(controller.safeToPodId(mockSafeAddress), 0);
    }

    // UPDATE POD STATE TESTS
    // cannot be called with zero safe
    // can not be called by unregistered controller
    // can not be called if pod exists
    // if not admin don't set admin and module lock
    //// should set pod id and safe
    // if admin set admin and module lock
    //// should set pod id and safe

    function test_podStateCalledWithZeroSafe() public {
        vm.expectRevert("Invalid address");
        controller.updatePodState(0, address(0), address(0));
    }

    function test_podStateCalledFromUnregisteredController() public {
        vm.mockCall(
            address(mockControllerRegistry),
            abi.encodeWithSelector(
                mockControllerRegistry.isRegistered.selector
            ),
            abi.encode(false)
        );
        vm.expectRevert("Controller not registered");
        controller.updatePodState(0, address(0), mockSafeAddress);
    }

    function test_podStateCalledWithExistingPod() public {
        uint256 podId = createPod(false);
        vm.expectRevert("Pod already exists");
        controller.updatePodState(podId, address(0), mockSafeAddress);
    }

    function test_podStateCall() public {
        controller.updatePodState(1, address(0), mockSafeAddress);
        assertEq(controller.podIdToSafe(1), mockSafeAddress);
        assertEq(controller.safeToPodId(mockSafeAddress), 1);
        assertEq(controller.podAdmin(1), address(0));
        assertEq(controller.isTransferLocked(1), false);
    }

    function test_podStateCallWithAdmin() public {
        controller.updatePodState(1, admin, mockSafeAddress);
        assertEq(controller.podIdToSafe(1), mockSafeAddress);
        assertEq(controller.safeToPodId(mockSafeAddress), 1);
        assertEq(controller.podAdmin(1), admin);
        assertEq(controller.isTransferLocked(1), false);
    }

    // EJECT SAFE TESTS
    // cannot eject non pod
    // cannot eject if from non safe if not admin
    // cannot eject if safe and label don't match
    // cannot eject if not admin
    // if admin - turn off module lock on eject
    // on eject should - zero admin, podid, safe id

    function setupResolver(address addr) public {
        MockResolver resolver = new MockResolver();
        vm.mockCall(
            address(mockPodEnsRegistrar),
            abi.encodeWithSelector(mockPodEnsRegistrar.resolver.selector),
            abi.encode(address(resolver))
        );
        vm.mockCall(
            address(resolver),
            abi.encodeWithSelector(resolver.addr.selector),
            abi.encode(addr)
        );
    }

    function test_ejectSafeNonPod() public {
        vm.expectRevert("pod not registered");
        controller.ejectSafe(1, bytes32("label"), address(0));
    }

    function test_ejectSafeNonAdmin() public {
        uint256 podId = createPod(true);
        vm.expectRevert("must be admin");
        controller.ejectSafe(podId, bytes32("label"), address(0));
    }

    function test_ejectSafeNonSafe() public {
        uint256 podId = createPod(false);
        vm.expectRevert("tx must be sent from safe");
        controller.ejectSafe(podId, bytes32("label"), address(0));
    }

    function test_ejectSafeBadLabel() public {
        uint256 podId = createPod(true);
        setupResolver(address(0x1337));
        vm.prank(admin);
        vm.expectRevert("safe and label didn't match");
        controller.ejectSafe(podId, bytes32("badLabel"), address(0));
    }

    function test_ejectSafe() public {
        uint256 podId = createPod(true);
        setupResolver(address(mockSafeAddress));
        vm.prank(admin);
        controller.ejectSafe(podId, bytes32("label"), address(0));
        assertEq(controller.podIdToSafe(podId), address(0));
        assertEq(controller.safeToPodId(mockSafeAddress), 0);
        assertEq(controller.podAdmin(podId), address(0));
    }

    // BATCH MINT AND BURN TESTS
    // should not be able to call from non safe
    function test_batchMintBurnBadCaller() public {
        uint256 podId = createPod(true);

        address[] memory mintMembers = new address[](1);
        mintMembers[0] = address(0x1);
        address[] memory burnMembers = new address[](1);
        burnMembers[0] = address(0x2);
        vm.expectRevert("not authorized");
        controller.batchMintAndBurn(podId, mintMembers, burnMembers);
    }

    // BEFORE TOKEN TRANSFER TESTS
    // should not transfer if not from member token
    // if transfer lock is sync, should not be able to transfer
    // if operator is controller and burn sync flag
    //// should unset burn sync flag

    function getIdAndAmounts(uint256 id)
        public
        pure
        returns (uint256[] memory, uint256[] memory)
    {
        uint256[] memory ids = new uint256[](1);
        uint256[] memory amounts = new uint256[](1);
        ids[0] = id;
        amounts[0] = 1;
        return (ids, amounts);
    }

    function test_tokenTransferBadCaller() public {
        (uint256[] memory ids, uint256[] memory amounts) = getIdAndAmounts(1);
        vm.expectRevert("Not Authorized");
        controller.beforeTokenTransfer(
            address(0x1337),
            address(0x1338),
            address(0x1339),
            ids,
            amounts,
            bytes(" ")
        );
    }

    function test_tokenTransferTokenLock() public {
        uint256 podId = createPod(true);
        vm.prank(admin);
        controller.setPodTransferLock(podId, true);
        vm.prank(address(mockMemberToken));
        (uint256[] memory ids, uint256[] memory amounts) = getIdAndAmounts(
            podId
        );
        vm.expectRevert("Pod Is Transfer Locked");
        controller.beforeTokenTransfer(
            address(0x1337),
            address(0x1338),
            address(0x1339),
            ids,
            amounts,
            bytes(" ")
        );
    }

    // CHECK TRANSACTION TESTS
    // if pod id is zero and safe is address zero return
    // if pod id is zero and safe is not msg sender should throw
    // if data and modles are locked should fail module transaction
    function test_checkTransactionZeroPod() public {
        controller.checkTransaction(
            address(0),
            0,
            bytes(" "),
            Enum.Operation.Call,
            0,
            0,
            0,
            address(0),
            payable(address(0x1)),
            bytes(" "),
            address(0)
        );
    }

    function test_checkTransactionZeroPodNotSafe() public {
        createPod(true);
        vm.expectRevert("Not Authorized");
        controller.checkTransaction(
            address(0),
            0,
            bytes(" "),
            Enum.Operation.Call,
            0,
            0,
            0,
            address(0),
            payable(address(0x1)),
            bytes(" "),
            address(0)
        );
    }

    function test_checkTransactionModuleLocked() public {
        uint256 podId = createPod(true);
        vm.prank(admin);
        controller.setPodModuleLock(podId, true);

        vm.prank(mockSafeAddress);
        vm.expectRevert("Cannot Enable Modules");
        controller.checkTransaction(
            address(0),
            0,
            abi.encodeWithSelector(
                mockSafe.enableModule.selector,
                abi.encode(address(0x2))
            ),
            Enum.Operation.Call,
            0,
            0,
            0,
            address(0),
            payable(address(0x1)),
            bytes(" "),
            address(0)
        );
    }
}
