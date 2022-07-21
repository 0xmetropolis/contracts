pragma solidity ^0.8.7;

contract MockEns {
    // ENS BASE MOCKS
    function owner(bytes32 node) public view returns (address) {
        return address(0);
    }

    function setSubnodeRecord(
        bytes32 node,
        bytes32 label,
        address owner,
        address resolver,
        uint64 value
    ) public {
        return;
    }

    function setApprovalForAll(address to, bool approved) public {
        return;
    }

    function setAddr(bytes32 node, address nodeAddress) public {
        return;
    }
}
