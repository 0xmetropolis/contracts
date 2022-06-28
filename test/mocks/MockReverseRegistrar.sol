pragma solidity ^0.8.7;

contract MockReverseRegistrar {
    string public name;

    function setName(string memory _name) public {
        name = _name;
    }
}
