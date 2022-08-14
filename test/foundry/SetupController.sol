// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.7;
import "safe-contracts/GnosisSafe.sol";
import "safe-contracts/proxies/GnosisSafeProxyFactory.sol";
import "safe-contracts/handler/CompatibilityFallbackHandler.sol";
import "../../contracts/ControllerRegistry.sol";

contract ControllerDepSetup {
    // safe deps
    GnosisSafe public gnosisSafe = new GnosisSafe();
    GnosisSafeProxyFactory public gnosisSafeProxyFactory =
        new GnosisSafeProxyFactory();
    CompatibilityFallbackHandler public compatibilityFallbackHandler =
        new CompatibilityFallbackHandler();
    // our deps
    ControllerRegistry public controllerRegistry = new ControllerRegistry();
}
