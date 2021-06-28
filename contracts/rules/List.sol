pragma solidity 0.7.4;

contract List {
    constructor() {}

    function isMemberOfArray(address member, address[] memory array) public pure returns(uint) {
        for (uint256 i = 0; i < array.length; i++) {
            if(array[i] == member){
                return 1;
            }
        }
        return 0;
    }
}