// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.7;

import "forge-std/Test.sol";
import "../../contracts/MemberToken.sol";
import "../../contracts/ControllerRegistry.sol";
import "../../contracts/interfaces/IControllerBase.sol";

contract BeforeTokenTransferArgs {
    address public operator;
    address public from;
    address public to;
    uint256[] public ids;
    uint256[] public amounts;
    bytes public data;

    constructor(
        address _operator,
        address _from,
        address _to,
        uint256[] memory _ids,
        uint256[] memory _amounts,
        bytes memory _data
    ) {
        operator = _operator;
        from = _from;
        to = _to;
        ids = _ids;
        amounts = _amounts;
        data = _data;
    }
}

contract MockController {
    BeforeTokenTransferArgs[] public beforeTokenTransferCall;

    function beforeTokenTransferCalls()
        public
        view
        returns (BeforeTokenTransferArgs[] memory)
    {
        return beforeTokenTransferCall;
    }

    function beforeTokenTransfer(
        address _operator,
        address _from,
        address _to,
        uint256[] memory _ids,
        uint256[] memory _amount,
        bytes memory _data
    ) external {
        beforeTokenTransferCall.push(
            new BeforeTokenTransferArgs(
                _operator,
                _from,
                _to,
                _ids,
                _amount,
                _data
            )
        );
    }
}

contract MemberTokenTest is Test {
    ControllerRegistry controllerRegistry;
    MemberToken memberToken;
    MockController mockController;

    address ALICE = address(0x1337);
    address BOB = address(0x1338);

    function setUp() public {
        controllerRegistry = new ControllerRegistry();
        memberToken = new MemberToken(address(controllerRegistry), "uriString");
        // mock address(this) as controller
        mockController = new MockController();
        controllerRegistry.registerController(address(mockController));
    }

    // CONSTRUCTOR TESTS
    // should set the controller registry address
    function test_ConstructorSetsControllerRegistry() public {
        assertEq(
            address(memberToken.controllerRegistry()),
            address(controllerRegistry)
        );
        assertEq(memberToken.uri(1), "uriString");
    }

    // should revert on controller registry zero address
    function test_ZeroAddressConstructor() public {
        vm.expectRevert("Invalid address");
        new MemberToken(address(0), "uriString");
    }

    // CREATEPOD TESTS
    // should create pod
    function test_CreatePod() public {
        address[] memory addresses = new address[](2);
        addresses[0] = ALICE;
        addresses[1] = BOB;

        vm.prank(address(mockController));
        uint256 podId = memberToken.createPod(addresses, "1337");
        // member controller should be set to mockcontroller
        assertEq(memberToken.memberController(podId), address(mockController));
        // check member tokens
        assertEq(memberToken.balanceOf(ALICE, podId), 1);
        assertEq(memberToken.balanceOf(BOB, podId), 1);

        // use mocking pattern we are recording the payload of each function call
        BeforeTokenTransferArgs[]
            memory beforeTokenTransferCalls = mockController
                .beforeTokenTransferCalls();

        // should be called once for each address
        assertEq(beforeTokenTransferCalls.length, 2);
        // check args beforeTokenTransfer was called with for first call
        assertEq(
            beforeTokenTransferCalls[0].operator(),
            address(mockController)
        );
        assertEq(beforeTokenTransferCalls[0].from(), address(0));
        assertEq(beforeTokenTransferCalls[0].to(), ALICE);
        assertEq(beforeTokenTransferCalls[0].ids(0), podId);
        assertEq(beforeTokenTransferCalls[0].amounts(0), 1);
        assertEq(beforeTokenTransferCalls[0].data(), "1337");
        // check args beforeTokenTransfer was called with for second call
        assertEq(
            beforeTokenTransferCalls[1].operator(),
            address(mockController)
        );
        assertEq(beforeTokenTransferCalls[1].from(), address(0));
        assertEq(beforeTokenTransferCalls[1].to(), BOB);
        assertEq(beforeTokenTransferCalls[1].ids(0), podId);
        assertEq(beforeTokenTransferCalls[1].amounts(0), 1);
        assertEq(beforeTokenTransferCalls[1].data(), "1337");
    }

    // should revert if pod is created from unregistered controller
    function test_CreatePodFromUnregisteredController() public {
        vm.expectRevert("Controller not registered");
        address[] memory addresses = new address[](1);
        addresses[0] = ALICE;

        memberToken.createPod(addresses, "1337");
    }

    // MINTING TESTS
    // should mint member
    function test_Mint() public {
        address[] memory addresses = new address[](1);
        addresses[0] = ALICE;

        vm.prank(address(mockController));
        uint256 podId = memberToken.createPod(addresses, "1337");

        // should mint membership to bob
        memberToken.mint(BOB, podId, " ");
        assertEq(memberToken.balanceOf(BOB, podId), 1);
    }

    // should revert if minting to existing member
    function test_MintToExistingMember() public {
        address[] memory addresses = new address[](1);
        addresses[0] = ALICE;

        vm.prank(address(mockController));
        uint256 podId = memberToken.createPod(addresses, "1337");

        // should not mint second membership to alice
        vm.expectRevert("User is already member");
        memberToken.mint(ALICE, podId, " ");
    }

    // should revert if minting to a non existant pod
    function test_MintToNonExistantPod() public {
        vm.expectRevert("Pod doesn't exist");
        memberToken.mint(ALICE, 1, " ");
    }

    // BATCH TRANSFER TESTS
    // should batch transfer different memberships from same controller
    function test_BatchTransfer() public {
        address[] memory addresses = new address[](1);
        addresses[0] = ALICE;

        vm.startPrank(address(mockController));
        uint256 podIdA = memberToken.createPod(addresses, "1337");
        uint256 podIdB = memberToken.createPod(addresses, "1337");
        vm.stopPrank();

        uint256[] memory podIds = new uint256[](2);
        uint256[] memory value = new uint256[](2);
        podIds[0] = podIdA;
        podIds[1] = podIdB;
        value[0] = 1;
        value[1] = 1;

        vm.prank(address(ALICE));
        memberToken.safeBatchTransferFrom(ALICE, BOB, podIds, value, "1337");
        assertEq(memberToken.balanceOf(BOB, podIdA), 1);
        assertEq(memberToken.balanceOf(BOB, podIdB), 1);
    }

    // should revert if transfering memberships associated with different controllers
    function test_MatchTransferDifferentControllers() public {
        MockController mockControllerNew = new MockController();
        controllerRegistry.registerController(address(mockControllerNew));

        address[] memory addresses = new address[](1);
        addresses[0] = ALICE;

        vm.prank(address(mockController));
        uint256 podIdA = memberToken.createPod(addresses, "1337");
        vm.prank(address(mockControllerNew));
        uint256 podIdB = memberToken.createPod(addresses, "1337");

        uint256[] memory podIds = new uint256[](2);
        uint256[] memory value = new uint256[](2);
        podIds[0] = podIdA;
        podIds[1] = podIdB;
        value[0] = 1;
        value[1] = 1;

        vm.prank(address(ALICE));
        vm.expectRevert("Ids have different controllers");
        memberToken.safeBatchTransferFrom(ALICE, BOB, podIds, value, "1337");
    }

    // URI TESTS
    // should be able to edit uri
    function test_EditUri() public {
        memberToken.setUri("newUri");
        assertEq(memberToken.uri(1), "newUri");
    }

    // should revert if non owner edits URI
    function test_EditUriByNonOwner(address randAddress) public {
        vm.assume(randAddress != address(this));
        vm.prank(randAddress);
        vm.expectRevert("Ownable: caller is not the owner");
        memberToken.setUri("newUri");
    }

    // CONTROLLER MIGRATE TESTS
    // should migrate to new controller version
    function test_MigrateMemberController() public {
        address newController = address(0x1337);
        controllerRegistry.registerController(newController);

        address[] memory addresses = new address[](1);
        addresses[0] = ALICE;

        vm.startPrank(address(mockController));
        uint256 podId = memberToken.createPod(addresses, "1337");

        memberToken.migrateMemberController(podId, newController);
        assertEq(memberToken.memberController(podId), newController);
    }

    // should revert if called with zero address
    function test_MigrateWithZeroAddress() public {
        vm.expectRevert("Invalid address");
        memberToken.migrateMemberController(1, address(0));
    }

    // should revert if msg.sender isn't the current pod controller
    function test_MigrateFromBadCaller(address randAddress) public {
        vm.assume(randAddress != address(mockController));

        address fakeController = address(0x1337);
        address[] memory addresses = new address[](1);
        addresses[0] = ALICE;

        vm.prank(address(mockController));
        uint256 podId = memberToken.createPod(addresses, "1337");

        vm.prank(randAddress);
        vm.expectRevert("Invalid migrate controller");
        memberToken.migrateMemberController(podId, fakeController);
    }

    // should revert if new controller isnt registered
    function test_MigrateToUnregisteredController() public {
        address fakeController = address(0x1339);
        address[] memory addresses = new address[](1);
        addresses[0] = ALICE;

        vm.startPrank(address(mockController));
        uint256 podId = memberToken.createPod(addresses, "1337");

        vm.expectRevert("Controller not registered");
        memberToken.migrateMemberController(podId, fakeController);
    }
}
