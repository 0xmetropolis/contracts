pragma solidity ^0.8.7;

contract MockPodEnsRegistrar {
    function registerPod(
        bytes32,
        address,
        address
    ) external pure returns (address) {
        return address(0xe1337);
    }

    function setText(
        bytes32,
        string memory,
        string memory
    ) external pure {
        return;
    }

    function setAddr(bytes32, address) external pure {
        return;
    }

    function register(bytes32, address) external pure {
        return;
    }

    function getEnsNode(bytes32) external pure returns (bytes32) {
        return bytes32(0);
    }

    function resolver() external pure returns (address) {
        return address(0x1);
    }

    function reverseRegistrar() external pure returns (address) {
        return address(0x1);
    }
}
