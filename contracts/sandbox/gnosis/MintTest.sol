pragma solidity 0.5.4;

contract MintTest {
    uint256 public test = 0;

    constructor() public {}

    function mint() public {
        test = 10;
    }
}
