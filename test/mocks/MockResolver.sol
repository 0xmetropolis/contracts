pragma solidity ^0.8.7;

contract MockResolver {
    function addr(bytes32) public pure returns (address) {
        return address(0x1);
    }
}
