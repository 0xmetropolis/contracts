pragma solidity 0.5.4;

contract BalanceTest {
    constructor() public {}

    function balanceOfAddress(address account) public returns (uint256) {
        return 100;
    }

    function balanceOfInt(uint256 number) public returns (uint256) {
        return 101;
    }

    function balanceOfMulti(
        address account,
        uint256 number,
        bytes32 word
    ) public returns (uint256) {
        return 102;
    }
}
