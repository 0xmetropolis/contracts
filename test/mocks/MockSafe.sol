pragma solidity ^0.8.7;
import {Enum} from "safe-contracts/base/GuardManager.sol";

contract MockSafe {
    function setup(
        address[] memory,
        uint256,
        address,
        bytes memory,
        address,
        address,
        uint256,
        address
    ) external pure {
        return;
    }

    function execTransactionFromModule(
        address,
        uint256,
        bytes memory,
        Enum.Operation
    ) external pure returns (bool) {
        return true;
    }

    function getThreshold() external pure returns (uint256) {
        return 1;
    }

    function getOwners() external pure returns (address[] memory) {
        address[] memory owners = new address[](2);
        owners[0] = address(0xc1337);
        owners[1] = address(0xc1338);
        return owners;
    }

    function setGuard(address) external pure {
        return;
    }

    function isOwner(address) external pure returns (bool) {
        return true;
    }

    function isModuleEnabled(address) external pure returns (bool) {
        return true;
    }

    function getModulesPaginated(address, uint256)
        external
        pure
        returns (address[] memory, address)
    {
        address[] memory modules = new address[](1);
        modules[0] = address(0x1); // sentry
        return (modules, address(0x1));
    }

    function enableModule(address) external pure {
        return;
    }
}
