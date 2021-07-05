pragma solidity 0.7.4;

interface GnosisSafe {
    /// @dev Allows a Module to execute a Safe transaction without any further confirmations.
    /// @param to Destination address of module transaction.
    /// @param value Ether value of module transaction.
    /// @param data Data payload of module transaction.
    /// @param operation Operation type of module transaction.
    function execTransactionFromModule(address to, uint256 value, bytes calldata data, Enum.Operation operation)
        external
        returns (bool success);
}

contract Enum {
    enum Operation {Call, DelegateCall}
}

contract SafeModule {
    
    GnosisSafe safe;

    constructor(address _safe) {
        safe = GnosisSafe(_safe);
    }

    function addOwnerWithThreshold(address owner,uint256 _threshold) public {
        bytes memory data = abi.encodeWithSignature("addOwnerWithThreshold(address,uint256)",owner, _threshold);
        
        safe.execTransactionFromModule(address(safe),0,data, Enum.Operation.Call);
    }
}