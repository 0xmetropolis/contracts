pragma solidity ^0.8.7;

import {BaseGuard, Enum} from "safe-contracts/base/GuardManager.sol";

contract MockController is BaseGuard {
    function checkTransaction(
        address,
        uint256,
        bytes memory,
        Enum.Operation,
        uint256,
        uint256,
        uint256,
        address,
        address payable,
        bytes memory,
        address
    ) external pure override {
        return;
    }

    function checkAfterExecution(bytes32, bool) external pure override {
        return;
    }
}
