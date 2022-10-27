pragma solidity 0.8.7;

import "openzeppelin-contracts/access/AccessControl.sol";
import "openzeppelin-contracts/utils/Address.sol";

// This contract will be the owner of all other contracts in the ecosystem.
contract PermissionManager is AccessControl {
    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    // Checks roles, and then call
    function callAsOwner(address contractAddress, bytes memory data)
        public
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        Address.isContract(contractAddress);
        // Call uses the context of this contract, so msg.sender of other contracts
        // will be this contract.
        (bool success, ) = contractAddress.call(data);
        require(success, "call failed");
    }
}
