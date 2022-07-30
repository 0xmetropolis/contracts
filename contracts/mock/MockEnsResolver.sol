pragma solidity ^0.8.7;

contract MockEnsResolver {
    // ENS RESOLVER MOCKS
    mapping(bytes32 => address) public addrs;

    function setAddr(bytes32 node, address nodeAddress) public {
        addrs[node] = nodeAddress;
    }

    function setText(
        bytes32 node,
        string memory key,
        string memory value
    ) public {
        return;
    }

    function addr(bytes32 node) public view returns (address) {
        return addrs[node];
    }
}
