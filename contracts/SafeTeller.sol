pragma solidity 0.7.4;

contract SafeTeller {
    // safe variables - Orca Governance should be able to update
    address public proxyFactoryAddress =
        0x76E2cFc1F5Fa8F6a5b3fC4c8F4788F0116861F9B;
    address public gnosisMasterAddress =
        0x34CfAC646f301356fAa8B21e94227e3583Fe3F5F;

    string public functionSigCreateProxy = "createProxy(address,bytes)";
    string public functionSigSetup =
        "setup(address[],uint256,address,bytes,address,address,uint256,address)";
    string public functionSigExecTransaction =
        "execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)";

    address controller;

    struct Action {
        address to;
        uint256 value;
        bytes data;
    }

    mapping(uint256 => Action) public actionProposalByPod;

    event CreateSafe(uint256 indexed podId, address safeAddress);
    event UpdateAction(
        uint256 _podId,
        address _to,
        uint256 _value,
        bytes _data
    );
    event ActionExecuted(bool success, bytes result);

    constructor() {
        controller = msg.sender;
    }

    function updateController(address _controller) public {
        require(controller == msg.sender, "!controller");
        controller = _controller;
    }

    function createSafe(uint256 _podId) public returns (address safeAddres) {
        require(controller == msg.sender, "!controller");
        bytes memory data = "";
        address[] memory ownerArray = new address[](1);
        ownerArray[0] = address(this);

        // encode the setup call that will be called on the new proxy safe
        // from the proxy factory
        bytes memory setupData =
            abi.encodeWithSignature(
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

        bytes memory createProxyWithSetupData =
            abi.encodeWithSignature(
                functionSigCreateProxy,
                gnosisMasterAddress,
                setupData
            );
        (bool success, bytes memory result) =
            proxyFactoryAddress.call(createProxyWithSetupData);
        require(success == true, "Create Proxy With Data Failed");
        address safeAddress = bytesToAddress(result);
        emit CreateSafe(_podId, safeAddress);
        return safeAddress;
    }

    function createPendingAction(
        uint256 _podId,
        address _to,
        uint256 _value,
        bytes memory _data
    ) public returns (bool) {
        require(controller == msg.sender, "!controller");
        actionProposalByPod[_podId] = Action({
            to: _to,
            value: _value,
            data: _data
        });
        UpdateAction(_podId, _to, _value, _data);
        return true;
    }

    function executeAction(uint256 _podId, address _safeAddress)
        public
        returns (bool)
    {
        require(controller == msg.sender, "!controller");
        uint8 operation = uint8(0);
        uint256 safeTxGas = uint256(0);
        uint256 baseGas = uint256(0);
        uint256 gasPrice = uint256(0);
        address gasToken = address(0);
        address refundReceiver = address(0);
        bytes memory signatures =
            abi.encodePacked(
                bytes32(uint256(address(this))),
                bytes32(uint256(0)),
                uint8(1)
            );

        Action memory executable = actionProposalByPod[_podId];

        bytes memory executeTransactionData =
            abi.encodeWithSignature(
                functionSigExecTransaction,
                executable.to,
                executable.value,
                executable.data,
                operation,
                safeTxGas,
                baseGas,
                gasPrice,
                gasToken,
                refundReceiver,
                signatures
            );
        (bool success, bytes memory result) =
            _safeAddress.call(executeTransactionData);

        emit ActionExecuted(success, result);
        return true;
    }

    function bytesToAddress(bytes memory bys)
        internal
        pure
        returns (address addr)
    {
        assembly {
            addr := mload(add(bys, 32))
        }
    }
}
