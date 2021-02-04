pragma solidity 0.5.4;

import "hardhat/console.sol";
import "./safe-contracts/contracts/GnosisSafe.sol";

contract SafeOwner {

    address public proxyFactoryAddress = 0x76E2cFc1F5Fa8F6a5b3fC4c8F4788F0116861F9B;
    address public masterGnosisContract = 0x34CfAC646f301356fAa8B21e94227e3583Fe3F5F;

    bytes4 internal constant _INTERFACE_ID_ERC1271 = 0x1626ba7e;
    bytes4 internal constant _ERC1271FAILVALUE = 0xffffffff;

    address private safeAddress;
    // bytes4 functionSigCreateProxy = bytes4(keccak256("createProxy(address,bytes)"));
    // bytes4 functionSigSetup = bytes4(keccak256("setup(address[],uint256,address,bytes,
    // address,address,uint256,address)"));
    string public functionSigCreateProxy = "createProxy(address,bytes)";
    string public functionSigSetup = "setup(address[],uint256,address,bytes,address,address,uint256,address)";
    string public functionSigExecTransaction = "execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)";

    event TransactionSuccess(bool torf, address contractAddress);

    GnosisSafe public testMasterSafe;

    constructor() public {
         testMasterSafe = new GnosisSafe();
    }

    function createProxyNoData() public {
        // test with no setup data
        bytes memory data = "";
        (bool success, bytes memory result) = proxyFactoryAddress.call(abi.encodeWithSignature(functionSigCreateProxy, address(testMasterSafe), data));
        require(success == true, "Create Proxy No Data Failed");
    }

    function createProxyWithData() public returns (address){
        bytes memory data = "";
        address[] memory ownerArray = new address[](1);
        ownerArray[0] = address(this);

        bytes memory setupData = abi.encodeWithSignature(
            functionSigSetup,
            ownerArray,
            uint256(1),
            address(0),
            data,
            address(0),
            address(0),
            uint256(0),
            address(0)
        );

        bytes memory createProxyWithSetupData = abi.encodeWithSignature(functionSigCreateProxy, address(testMasterSafe), setupData);
        (bool success, bytes memory result) = proxyFactoryAddress.call(createProxyWithSetupData);
        require(success == true, "Create Proxy With Data Failed");
        safeAddress = bytesToAddress(result);
        emit TransactionSuccess(success, safeAddress);
    }

    function executeTransaction(address contractAddress) public returns (bool torf)
    {
      // address to,
      // uint256 value,
      // bytes calldata data,
      // Enum.Operation operation,
      // uint256 safeTxGas,
      // uint256 baseGas,
      // uint256 gasPrice,
      // address gasToken,
      // address payable refundReceiver,
      // bytes calldata signatures
      address to = contractAddress;
      uint256 value = uint256(0);
      bytes memory data = abi.encodeWithSignature("mint()");
      uint8 operation = uint8(0);
      uint256 safeTxGas = uint256(0);
      uint256 baseGas = uint256(0);
      uint256 gasPrice  = uint256(0);
      address gasToken = address(0);
      address refundReceiver = address(0);
      bytes memory signatures = abi.encodePacked(bytes32(uint256(address(this))), bytes32(uint256(0)), uint8(1));

      bytes memory executeTransactionData = abi.encodeWithSignature(
        functionSigExecTransaction,
        to,
        value,
        data,
        operation,
        safeTxGas,
        baseGas,
        gasPrice,
        gasToken,
        refundReceiver,
        signatures
      );
      (bool success, bytes memory result) = safeAddress.call(executeTransactionData);
      require(success == true, "Execute Transaction Failed");
      return success;
    }


    function bytesToAddress(bytes memory bys) public pure returns (address addr) {
        assembly {
          addr := mload(add(bys, 32))
       }
    }
}
