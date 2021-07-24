pragma solidity 0.7.4;

import "hardhat/console.sol";
import "@openzeppelin/contracts/utils/Address.sol";

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

    /// @dev Returns array of modules.
    /// @param start Start of the page.
    /// @param pageSize Maximum number of modules that should be returned.
    /// @return array Array of modules.
    /// @return next Start of the next page.
    function getModulesPaginated(address start, uint256 pageSize)
        external
        returns (address[] memory array, address next);
}

interface GnosisSafeProxyFactory {
    /// @dev Allows to create new proxy contact and execute a message call to the new proxy within one transaction.
    /// @param singleton Address of singleton contract.
    /// @param data Payload for message call sent to new proxy contract.
    function createProxy(address singleton, bytes memory data)
        external
        returns (address);
}

contract Enum {
    enum Operation {Call, DelegateCall}
}

contract SafeTeller {
    using Address for address;

    // mainnet: 0x76E2cFc1F5Fa8F6a5b3fC4c8F4788F0116861F9B;
    address public proxyFactoryAddress;

    // mainnet: 0x34CfAC646f301356fAa8B21e94227e3583Fe3F5F;
    address public gnosisMasterAddress;

    string public constant FUNCTION_SIG_SETUP =
        "setup(address[],uint256,address,bytes,address,address,uint256,address)";
    string public constant FUNCTION_SIG_EXEC =
        "execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)";

    string public constant FUNCTION_SIG_ENABLE = "delegateSetup(address)";

    address internal constant SENTINEL = address(0x1);

    address public controller;
    address public context;

    event CreateSafe(uint256 indexed podId, address safeAddress);

    constructor(address _proxyFactoryAddress, address _gnosisMasterAddress) {
        controller = msg.sender;
        proxyFactoryAddress = _proxyFactoryAddress;
        gnosisMasterAddress = _gnosisMasterAddress;
        context = address(this);
    }

    function updateController(address _controller) public {
        require(controller == msg.sender, "!controller");
        controller = _controller;
    }

    function migrateSafeTeller(address safe, address _newSafeTeller) public {
        require(controller == msg.sender, "!controller");
        bytes memory enableData =
            abi.encodeWithSignature("enableModule(address)", _newSafeTeller);

        bool enableSuccess =
            GnosisSafe(safe).execTransactionFromModule(
                safe,
                0,
                enableData,
                Enum.Operation.Call
            );
        require(enableSuccess, "Migration failed on enable");

        // find current safe teller in module array
        uint256 pageSize = 10;
        address index = SENTINEL;
        address prevModule;

        while (prevModule == address(0)) {
            (address[] memory moduleBuffer, address next) =
                GnosisSafe(safe).getModulesPaginated(index, pageSize);
            require(moduleBuffer[0] != address(0), "module not found");
            index = next;

            for (uint256 i = 0; i < moduleBuffer.length; i++) {
                if (moduleBuffer[i] == address(this))
                    prevModule = i > 0 ? moduleBuffer[i - 1] : moduleBuffer[0];
            }
        }

        // disable current safeTeller
        bytes memory disableData =
            abi.encodeWithSignature(
                "disableModule(address,address)",
                prevModule,
                address(this)
            );

        bool disableSuccess =
            GnosisSafe(safe).execTransactionFromModule(
                safe,
                0,
                disableData,
                Enum.Operation.Call
            );
        require(disableSuccess, "Migration failed on disable");
    }

    function createSafe(
        uint256 _podId,
        address[] memory _owners,
        uint256 _threshold
    ) public returns (address safeAddress) {
        require(controller == msg.sender, "!controller");
        bytes memory data =
            abi.encodeWithSignature(FUNCTION_SIG_ENABLE, context);

        // encode the setup call that will be called on the new proxy safe
        // from the proxy factory
        bytes memory setupData =
            abi.encodeWithSignature(
                FUNCTION_SIG_SETUP,
                _owners,
                _threshold,
                this,
                data,
                address(0),
                address(0),
                uint256(0),
                address(0)
            );

        try
            GnosisSafeProxyFactory(proxyFactoryAddress).createProxy(
                gnosisMasterAddress,
                setupData
            )
        returns (address safeAddress) {
            emit CreateSafe(_podId, safeAddress);
            return safeAddress;
        } catch (bytes memory) {
            revert("Create Proxy With Data Failed");
        }
    }

    //TODO: could probably do all this as a delegate call
    function onMint(address to, address safe) public {
        require(controller == msg.sender, "!controller");
        uint256 threshold = GnosisSafe(safe).getThreshold();

        bytes memory data =
            abi.encodeWithSignature(
                "addOwnerWithThreshold(address,uint256)",
                to,
                threshold
            );

        bool success =
            GnosisSafe(safe).execTransactionFromModule(
                safe,
                0,
                data,
                Enum.Operation.Call
            );

        require(success, "Module Transaction Failed");
    }

    function onBurn(address from, address safe) public {
        require(controller == msg.sender, "!controller");
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

        bool success =
            GnosisSafe(safe).execTransactionFromModule(
                safe,
                0,
                data,
                Enum.Operation.Call
            );
        require(success, "Module Transaction Failed");
    }

    function onTransfer(
        address from,
        address to,
        address safe
    ) public {
        require(controller == msg.sender, "!controller");
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

        bool success =
            GnosisSafe(safe).execTransactionFromModule(
                safe,
                0,
                data,
                Enum.Operation.Call
            );
        require(success, "Module Transaction Failed");
    }

    // Used in a delegate call to enable module add on setup
    function enableModule(address module) public {
        revert();
    }

    function delegateSetup(address _context) public {
        this.enableModule(_context);
    }
}
