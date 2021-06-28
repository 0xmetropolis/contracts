pragma solidity 0.7.4;
import "../../rules/List.sol";

contract ListTest {
    List list;
    
    constructor() {
        list = new List();
    }
    // stores res so the transaction can be debugged
    uint res;
    
    function isMemberOfArrayTest(address member, address[] memory memberArray) public returns (string memory){
        res = list.isMemberOfArray(member, memberArray);
        if (res != 1) return "member not found";

        return "success";
    }

    function isMemberOfArrayEncodedTest(address member, address[] memory memberArray) public returns (string memory){
        bytes4 sig = bytes4(keccak256("isMemberOfArray(address,address[])"));
        bytes memory params = abi.encode(member,memberArray);

        bytes memory data = abi.encodePacked(sig,params);
        bytes memory proof = abi.encodeWithSelector(sig,member,memberArray);

        if(keccak256((data)) != keccak256(proof)) return "invalid encoding";
        
        (bool success, bytes memory result) = address(list).call(data);
        
        res = abi.decode(result,(uint256));
        if(success != true) return "invalid call";
        if(res != 1) return "member not found";

        return "success";
    }
    
}