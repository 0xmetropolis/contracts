// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.7;

import "forge-std/Test.sol";
import "safe-contracts/GnosisSafe.sol";
import "safe-contracts/proxies/GnosisSafeProxyFactory.sol";
import "safe-contracts/handler/CompatibilityFallbackHandler.sol";
import "../../contracts/SafeTeller.sol";
import "../../contracts/utils/SafeTxHelper.sol";
import "safe-contracts/common/Enum.sol";
import "../mocks/MockReverseRegistrar.sol";

// Running tests in the context of SafeTeller to test internal functions
contract SafeTellerInternalTest is Test, SafeTeller, SafeTxHelper {
    using stdStorage for StdStorage;
    GnosisSafe gnosisSafe = new GnosisSafe();
    GnosisSafeProxyFactory gnosisSafeProxyFactory =
        new GnosisSafeProxyFactory();
    CompatibilityFallbackHandler compatibilityFallbackHandler =
        new CompatibilityFallbackHandler();

    bytes32 GUARD_STORAGE =
        0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8;
    address safeTeller = address(this);

    address ALICE = address(0x1337);
    address BOB = address(0x1338);
    address CHARLIE = address(0x1339);

    constructor()
        SafeTeller(
            address(gnosisSafeProxyFactory),
            address(gnosisSafe),
            address(compatibilityFallbackHandler)
        )
    {}

    // HELPER METHODS
    function setupSafe() public returns (GnosisSafe) {
        address[] memory addresses = new address[](2);
        addresses[0] = ALICE;
        addresses[1] = BOB;
        uint256 threshold = 1;

        return GnosisSafe(payable(super.createSafe(addresses, threshold)));
    }

    // CREATESAFE TESTS
    // should create a new safe
    function test_CreateSafe() public {
        address[] memory addresses = new address[](2);
        addresses[0] = ALICE;
        addresses[1] = BOB;
        uint256 threshold = 1;

        address payable newSafe = payable(
            super.createSafe(addresses, threshold)
        );

        // check owners are set
        address[] memory owners = GnosisSafe(newSafe).getOwners();
        assertEq(owners.length, addresses.length);
        assertEq(owners[0], ALICE);
        assertEq(owners[1], BOB);
        // check module is enabled
        assertTrue(GnosisSafe(newSafe).isModuleEnabled(safeTeller));
        // check guard is set - need to use this lookup because its stored in an arbitrary storage slot
        assertEq(
            bytes32(vm.load(newSafe, GUARD_STORAGE) << 96),
            bytes32(abi.encodePacked(safeTeller))
        );
    }

    // should throw on bad safe setup
    function testFail_CreateBadSafe() public {
        address[] memory addresses = new address[](1);
        addresses[0] = ALICE;
        uint256 threshold = 0; // bad threshold

        super.createSafe(addresses, threshold);
    }

    // TOKEN CALLBACK TESTS
    // should mint safe owner
    function test_OnMint() public {
        GnosisSafe safe = setupSafe();

        super.onMint(CHARLIE, address(safe));
        assertTrue(safe.isOwner(CHARLIE));
    }

    // should transfer safe owner
    function test_OnTransfer() public {
        GnosisSafe safe = setupSafe();

        super.onTransfer(ALICE, CHARLIE, address(safe));
        assertTrue(safe.isOwner(CHARLIE));
        assertFalse(safe.isOwner(ALICE));
    }

    // should burn safe owner
    function test_OnBurn() public {
        GnosisSafe safe = setupSafe();

        super.onBurn(ALICE, address(safe));
        assertFalse(safe.isOwner(ALICE));
    }

    // MODULE LOCK TESTS
    // should lock module
    function test_LockModule() public {
        GnosisSafe safe = setupSafe();
        // lock modules
        super.setModuleLock(address(safe), true);
        assertTrue(this.areModulesLocked(address(safe)));

        vm.startPrank(ALICE);
        // brackets so i can reuse vars
        {
            // should prevent disable module
            bytes memory txData = abi.encodeWithSelector(
                safe.disableModule.selector,
                SENTINEL,
                address(this)
            );
            bytes32 txHash = getSafeTxHash(address(safe), txData, safe);
            safe.approveHash(txHash);

            vm.expectRevert("Cannot Disable Modules");
            executeSafeTxFrom(ALICE, txData, safe);
        }
        {
            // should prevent enable module
            bytes memory txData = abi.encodeWithSelector(
                safe.enableModule.selector,
                address(0x1340)
            );
            bytes32 txHash = getSafeTxHash(address(safe), txData, safe);
            safe.approveHash(txHash);

            vm.expectRevert("Cannot Enable Modules");
            executeSafeTxFrom(ALICE, txData, safe);
        }
        {
            // should prevent removing guard
            bytes memory txData = abi.encodeWithSelector(
                safe.setGuard.selector,
                address(0)
            );
            bytes32 txHash = getSafeTxHash(address(safe), txData, safe);
            safe.approveHash(txHash);

            vm.expectRevert("Cannot Change Guard");
            executeSafeTxFrom(ALICE, txData, safe);
        }
    }

    function test_UnlockModule() public {
        GnosisSafe safe = setupSafe();
        // lock modules
        super.setModuleLock(address(safe), true);
        // unlock modules
        super.setModuleLock(address(safe), false);
        assertFalse(this.areModulesLocked(address(safe)));

        vm.startPrank(ALICE);
        // brackets so i can reuse vars
        address mockModule = address(0x1340);
        {
            // should enable module
            bytes memory txData = abi.encodeWithSelector(
                safe.enableModule.selector,
                mockModule
            );
            bytes32 txHash = getSafeTxHash(address(safe), txData, safe);
            safe.approveHash(txHash);
            executeSafeTxFrom(ALICE, txData, safe);
            assertTrue(safe.isModuleEnabled(safeTeller));
        }
        {
            // should  disable module
            bytes memory txData = abi.encodeWithSelector(
                safe.disableModule.selector,
                SENTINEL,
                mockModule
            );
            bytes32 txHash = getSafeTxHash(address(safe), txData, safe);
            safe.approveHash(txHash);

            executeSafeTxFrom(ALICE, txData, safe);
            assertTrue(safe.isModuleEnabled(safeTeller));
        }

        {
            // should remove guard
            bytes memory txData = abi.encodeWithSelector(
                safe.setGuard.selector,
                address(0)
            );
            bytes32 txHash = getSafeTxHash(address(safe), txData, safe);
            safe.approveHash(txHash);

            executeSafeTxFrom(ALICE, txData, safe);
            // check guard is set - need to use this lookup because its stored in an arbitrary storage slot
            assertEq(
                bytes32(vm.load(address(safe), GUARD_STORAGE) << 96),
                bytes32(abi.encodePacked(address(0)))
            );
        }
        vm.stopPrank();
    }

    function test_setupSafeReverseResolver() public {
        GnosisSafe safe = setupSafe();
        MockReverseRegistrar mockReverseRegistrar = new MockReverseRegistrar();

        super.setupSafeReverseResolver(
            address(safe),
            address(mockReverseRegistrar),
            "test"
        );
        assertEq("test", mockReverseRegistrar.name());
    }

    function test_migrateSafeTeller() public {
        GnosisSafe safe = setupSafe();
        // deploy new safe teller
        SafeTeller newSafeTeller = new SafeTeller(
            address(gnosisSafeProxyFactory),
            address(gnosisSafe),
            address(compatibilityFallbackHandler)
        );

        super.migrateSafeTeller(
            address(safe),
            address(newSafeTeller),
            address(newSafeTeller) // this will be prev module at runtime due to ordering
        );
        // check old module is disabled
        assertFalse(safe.isModuleEnabled(address(safeTeller)));
        // check new module is enabled
        assertTrue(safe.isModuleEnabled(address(newSafeTeller)));
    }
}
