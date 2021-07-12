pragma solidity 0.7.4;

import "hardhat/console.sol";

interface GnosisSafe {
    /// @dev Allows a Module to execute a Safe transaction without any further confirmations.
    /// @param to Destination address of module transaction.
    /// @param value Ether value of module transaction.
    /// @param data Data payload of module transaction.
    /// @param operation Operation type of module transaction.
    function execTransactionFromModule(
        address to,
        uint256 value,
        bytes calldata data,
        Enum.Operation operation
    ) external returns (bool success);

    /// @dev Returns array of owners.
    /// @return Array of Safe owners.
    function getOwners() external returns (address[] memory);

    function getThreshold() external returns (uint256);
}

contract Enum {
    enum Operation {Call, DelegateCall}
}

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

    string public functionSigEnableModule = "delegateSetup(address)";

    address internal constant SENTINEL = address(0x1);

    address controller;
    address context;

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
        context = address(this);
    }

    function updateSafeAddresses(
        address _proxyFactoryAddress,
        address _gnosisMasterAddress
    ) public {
        proxyFactoryAddress = _proxyFactoryAddress;
        gnosisMasterAddress = _gnosisMasterAddress;
    }

    function updateController(address _controller) public {
        require(controller == msg.sender, "!controller");
        controller = _controller;
    }

    function createSafe(
        uint256 _podId,
        address[] memory _owners,
        uint256 _threshold
    ) public returns (address safeAddress) {
        require(controller == msg.sender, "!controller");
        bytes memory data =
            abi.encodeWithSignature(functionSigEnableModule, context);

        // encode the setup call that will be called on the new proxy safe
        // from the proxy factory
        bytes memory setupData =
            abi.encodeWithSignature(
                functionSigSetup,
                _owners,
                _threshold,
                this,
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
        // TODO: this fails silently
        (bool success, bytes memory result) =
            proxyFactoryAddress.call(createProxyWithSetupData);
        require(success == true, "Create Proxy With Data Failed");
        address safeAddress = bytesToAddress(result);
        emit CreateSafe(_podId, safeAddress);
        return safeAddress;
    }

    //TODO: could probably do all this as a delegate call
    function onMint(address to, address safe) public {
        uint256 threshold = GnosisSafe(safe).getThreshold();

        bytes memory data =
            abi.encodeWithSignature(
                "addOwnerWithThreshold(address,uint256)",
                to,
                threshold
            );

        GnosisSafe(safe).execTransactionFromModule(
            safe,
            0,
            data,
            Enum.Operation.Call
        );
    }

    function onBurn(address from, address safe) public {
        uint256 threshold = GnosisSafe(safe).getThreshold();
        address[] memory owners = GnosisSafe(safe).getOwners();

        //look for the address pointing to address from
        address prevFrom;
        for (uint256 i = 0; i < owners.length; i++) {
            if (owners[i] == from) {
                if (i == 0) {
                    prevFrom = SENTINEL;
                } else {
                    prevFrom = owners[i - 1];
                }
            }
        }
        if (owners.length - 1 < threshold) threshold -= 1;
        bytes memory data =
            abi.encodeWithSignature(
                "removeOwner(address,address,uint256)",
                prevFrom,
                from,
                threshold
            );

        GnosisSafe(safe).execTransactionFromModule(
            safe,
            0,
            data,
            Enum.Operation.Call
        );
    }

    function onTransfer(
        address operator,
        address from,
        address to,
        address safe
    ) public {
        uint256 threshold = GnosisSafe(safe).getThreshold();
        address[] memory owners = GnosisSafe(safe).getOwners();

        //look for the address pointing to address from
        address prevFrom;
        for (uint256 i = 0; i < owners.length; i++) {
            if (owners[i] == from) {
                if (i == 0) {
                    prevFrom = SENTINEL;
                } else {
                    prevFrom = owners[i - 1];
                }
            }
        }

        bytes memory data =
            abi.encodeWithSignature(
                "swapOwner(address,address,address)",
                prevFrom,
                from,
                to
            );

        GnosisSafe(safe).execTransactionFromModule(
            safe,
            0,
            data,
            Enum.Operation.Call
        );
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

    // Used to enable module add on setup
    function enableModule(address module) public {
        revert();
    }

    function delegateSetup(address _context) public {
        this.enableModule(_context);
    }
}
