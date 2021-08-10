pragma solidity 0.7.4;

import "@openzeppelin/contracts/utils/Address.sol";
import "./interfaces/IGnosisSafe.sol";
import "./interfaces/IGnosisSafeProxyFactory.sol";

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

    /**
     * @param _proxyFactoryAddress The proxy factory address
     * @param _gnosisMasterAddress The gnosis master address
     */
    constructor(address _proxyFactoryAddress, address _gnosisMasterAddress) {
        require(
            _proxyFactoryAddress != address(0),
            "Invalid proxyFactory address"
        );
        require(
            _gnosisMasterAddress != address(0),
            "Invalid gnosisMaster address"
        );
        controller = msg.sender;
        proxyFactoryAddress = _proxyFactoryAddress;
        gnosisMasterAddress = _gnosisMasterAddress;
        context = address(this);
    }

    /**
     * @param _controller The address to set as controller
     */
    function updateController(address _controller) external {
        require(_controller != address(0), "Invalid controller address");
        require(controller == msg.sender, "!controller");
        controller = _controller;
    }

    /**
     * @param safe The address of the safe
     * @param _newSafeTeller The address of the new safe teller contract
     */
    function migrateSafeTeller(address safe, address _newSafeTeller) external {
        require(controller == msg.sender, "!controller");
        bytes memory enableData = abi.encodeWithSignature(
            "enableModule(address)",
            _newSafeTeller
        );

        bool enableSuccess = IGnosisSafe(safe).execTransactionFromModule(
            safe,
            0,
            enableData,
            IGnosisSafe.Operation.Call
        );
        require(enableSuccess, "Migration failed on enable");

        // find current safe teller in module array
        uint256 pageSize = 10;
        address index = SENTINEL;
        address prevModule = address(0);

        while (prevModule == address(0)) {
            (address[] memory moduleBuffer, address next) = IGnosisSafe(safe)
                .getModulesPaginated(index, pageSize);
            require(moduleBuffer[0] != address(0), "module not found");
            index = next;

            for (uint256 i = 0; i < moduleBuffer.length; i++) {
                if (moduleBuffer[i] == address(this))
                    prevModule = i > 0 ? moduleBuffer[i - 1] : moduleBuffer[0];
            }
        }

        // disable current safeTeller
        bytes memory disableData = abi.encodeWithSignature(
            "disableModule(address,address)",
            prevModule,
            address(this)
        );

        bool disableSuccess = IGnosisSafe(safe).execTransactionFromModule(
            safe,
            0,
            disableData,
            IGnosisSafe.Operation.Call
        );
        require(disableSuccess, "Migration failed on disable");
    }

    function getMembers(address safe) external returns (address[] memory) {
        return IGnosisSafe(safe).getOwners();
    }

    function isModuleEnabled(address safe) external view returns (bool) {
        return IGnosisSafe(safe).isModuleEnabled(address(this));
    }

    /**
     * @param _podId The id number of the pod
     * @param _owners The  addresses to be owners of the safe
     * @param _threshold The number of owners that are required to sign a transaciton
     * @return The address of the new safe
     */
    function createSafe(
        uint256 _podId,
        address[] memory _owners,
        uint256 _threshold
    ) external returns (address safeAddress) {
        require(controller == msg.sender, "!controller");
        bytes memory data = abi.encodeWithSignature(
            FUNCTION_SIG_ENABLE,
            context
        );

        // encode the setup call that will be called on the new proxy safe
        // from the proxy factory
        bytes memory setupData = abi.encodeWithSignature(
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
            IGnosisSafeProxyFactory(proxyFactoryAddress).createProxy(
                gnosisMasterAddress,
                setupData
            )
        returns (address newSafeAddress) {
            emit CreateSafe(_podId, newSafeAddress);
            return newSafeAddress;
        } catch (bytes memory) {
            revert("Create Proxy With Data Failed");
        }
    }

    //TODO: could probably do all this as a delegate call
    /**
     * @param to The account address to add as an owner
     * @param safe The address of the safe
     */
    function onMint(address to, address safe) external {
        require(controller == msg.sender, "!controller");
        uint256 threshold = IGnosisSafe(safe).getThreshold();

        bytes memory data = abi.encodeWithSignature(
            "addOwnerWithThreshold(address,uint256)",
            to,
            threshold
        );

        bool success = IGnosisSafe(safe).execTransactionFromModule(
            safe,
            0,
            data,
            IGnosisSafe.Operation.Call
        );

        require(success, "Module Transaction Failed");
    }

    /**
     * @param from The address to be removed as an owner
     * @param safe The address of the safe
     */
    function onBurn(address from, address safe) external {
        require(controller == msg.sender, "!controller");
        uint256 threshold = IGnosisSafe(safe).getThreshold();
        address[] memory owners = IGnosisSafe(safe).getOwners();

        //look for the address pointing to address from
        address prevFrom = address(0);
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
        bytes memory data = abi.encodeWithSignature(
            "removeOwner(address,address,uint256)",
            prevFrom,
            from,
            threshold
        );

        bool success = IGnosisSafe(safe).execTransactionFromModule(
            safe,
            0,
            data,
            IGnosisSafe.Operation.Call
        );
        require(success, "Module Transaction Failed");
    }

    /**
     * @param from The address being removed as an owner
     * @param to The address being added as an owner
     * @param safe The address of the safe
     */
    function onTransfer(
        address from,
        address to,
        address safe
    ) external {
        require(controller == msg.sender, "!controller");
        address[] memory owners = IGnosisSafe(safe).getOwners();

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

        bytes memory data = abi.encodeWithSignature(
            "swapOwner(address,address,address)",
            prevFrom,
            from,
            to
        );

        bool success = IGnosisSafe(safe).execTransactionFromModule(
            safe,
            0,
            data,
            IGnosisSafe.Operation.Call
        );
        require(success, "Module Transaction Failed");
    }

    // TODO: move to library
    // Used in a delegate call to enable module add on setup
    function enableModule(address module) external {
        require(module == address(0));
    }

    function delegateSetup(address _context) external {
        this.enableModule(_context);
    }
}
