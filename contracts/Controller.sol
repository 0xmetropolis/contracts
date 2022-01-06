pragma solidity 0.8.7;

/* solhint-disable indent */

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "./interfaces/IController.sol";
import "./interfaces/IMemberToken.sol";
import "./interfaces/IControllerRegistry.sol";
import "./SafeTeller.sol";
import "./ens/IPodEnsRegistrar.sol";

contract Controller is IController, SafeTeller, Ownable {
    event CreatePod(uint256 podId, address safe, address admin, string ensName);
    event UpdatePodAdmin(uint256 podId, address admin);

    IMemberToken public immutable memberToken;
    IControllerRegistry public immutable controllerRegistry;
    IPodEnsRegistrar public podEnsRegistrar;

    mapping(address => uint256) public safeToPodId;
    mapping(uint256 => address) public podIdToSafe;
    mapping(uint256 => address) public podAdmin;

    uint8 internal constant CREATE_EVENT = 0x01;

    /**
     * @dev Will instantiate safe teller with gnosis master and proxy addresses
     * @param _memberToken The address of the MemberToken contract
     * @param _controllerRegistry The address of the ControllerRegistry contract
     * @param _proxyFactoryAddress The proxy factory address
     * @param _gnosisMasterAddress The gnosis master address
     */
    constructor(
        address _memberToken,
        address _controllerRegistry,
        address _proxyFactoryAddress,
        address _gnosisMasterAddress,
        address _podEnsRegistrar,
        address _fallbackHandlerAddress
    )
        SafeTeller(
            _proxyFactoryAddress,
            _gnosisMasterAddress,
            _fallbackHandlerAddress
        )
    {
        require(_memberToken != address(0), "Invalid address");
        require(_controllerRegistry != address(0), "Invalid address");
        require(_proxyFactoryAddress != address(0), "Invalid address");
        require(_gnosisMasterAddress != address(0), "Invalid address");
        require(_podEnsRegistrar != address(0), "Invalid address");
        require(_fallbackHandlerAddress != address(0), "Invalid address");

        memberToken = IMemberToken(_memberToken);
        controllerRegistry = IControllerRegistry(_controllerRegistry);
        podEnsRegistrar = IPodEnsRegistrar(_podEnsRegistrar);
    }

    function updatePodEnsRegistrar(address _podEnsRegistrar)
        external
        onlyOwner
    {
        require(_podEnsRegistrar != address(0), "Invalid address");
        podEnsRegistrar = IPodEnsRegistrar(_podEnsRegistrar);
    }

    /**
     * @param _members The addresses of the members of the pod
     * @param threshold The number of members that are required to sign a transaction
     * @param _admin The address of the pod admin
     * @param _label label hash of pod name (i.e labelhash('mypod'))
     * @param _ensString string of pod ens name (i.e.'mypod.pod.xyz')
     */
    function createPod(
        address[] memory _members,
        uint256 threshold,
        address _admin,
        bytes32 _label,
        string memory _ensString,
        uint256 expectedPodId,
        string memory _imageUrl
    ) external {
        address safe = createSafe(_members, threshold);

        _createPod(
            _members,
            safe,
            _admin,
            _label,
            _ensString,
            expectedPodId,
            _imageUrl
        );
    }

    /**
     * @dev Used to create a pod with an existing safe
     * @dev Will automatically distribute membership NFTs to current safe members
     * @param _admin The address of the pod admin
     * @param _safe The address of existing safe
     * @param _label label hash of pod name (i.e labelhash('mypod'))
     * @param _ensString string of pod ens name (i.e.'mypod.pod.xyz')
     */
    function createPodWithSafe(
        address _admin,
        address _safe,
        bytes32 _label,
        string memory _ensString,
        uint256 expectedPodId,
        string memory _imageUrl
    ) external {
        require(_safe != address(0), "invalid safe address");
        require(safeToPodId[_safe] == 0, "safe already in use");
        require(isSafeModuleEnabled(_safe), "safe module must be enabled");
        require(
            isSafeMember(_safe, msg.sender) || msg.sender == _safe,
            "caller must be safe or member"
        );

        address[] memory members = getSafeMembers(_safe);

        _createPod(
            members,
            _safe,
            _admin,
            _label,
            _ensString,
            expectedPodId,
            _imageUrl
        );
    }

    /**
     * Generates a node hash from the Registrar's root node + the label hash.
     * @param label - label hash of pod name (i.e., labelhash('mypod'))
     */
    function getEnsNode(bytes32 label) public view returns (bytes32) {
        return
            keccak256(abi.encodePacked(podEnsRegistrar.getRootNode(), label));
    }

    /**
     * @param _members The addresses of the members of the pod
     * @param _admin The address of the pod admin
     * @param _safe The address of existing safe
     * @param _label label hash of pod name (i.e labelhash('mypod'))
     * @param _ensString string of pod ens name (i.e.'mypod.pod.xyz')
     */
    function _createPod(
        address[] memory _members,
        address _safe,
        address _admin,
        bytes32 _label,
        string memory _ensString,
        uint256 expectedPodId,
        string memory _imageUrl
    ) private {
        // add create event flag to token data
        bytes memory data = new bytes(1);
        data[0] = bytes1(uint8(CREATE_EVENT));

        uint256 podId = memberToken.createPod(_members, data);
        // The imageUrl has an expected pod ID, but we need to make sure it aligns with the actual pod ID
        require(podId == expectedPodId, "pod id didn't match, try again");

        emit CreatePod(podId, _safe, _admin, _ensString);
        emit UpdatePodAdmin(podId, _admin);

        if (_admin != address(0)) podAdmin[podId] = _admin;
        podIdToSafe[podId] = _safe;
        safeToPodId[_safe] = podId;

        // setup pod ENS
        address reverseRegistrar = podEnsRegistrar.registerPod(
            _label,
            _safe,
            msg.sender
        );
        setupSafeReverseResolver(_safe, reverseRegistrar, _ensString);

        // Node is how ENS identifies names, we need that to setText
        bytes32 node = getEnsNode(_label);
        podEnsRegistrar.setText(node, "avatar", _imageUrl);
        podEnsRegistrar.setText(node, "podId", Strings.toString(podId));
    }

    /**
     * @param _podId The id number of the pod
     * @param _newAdmin The address of the new pod admin
     */
    function updatePodAdmin(uint256 _podId, address _newAdmin) external {
        address admin = podAdmin[_podId];
        address safe = podIdToSafe[_podId];

        require(safe != address(0), "Pod doesn't exist");

        // if there is no admin it can only be added by safe
        if (admin == address(0)) {
            require(msg.sender == safe, "Only safe can add new admin");
        } else {
            require(msg.sender == admin, "Only admin can update admin");
        }
        podAdmin[_podId] = _newAdmin;

        emit UpdatePodAdmin(_podId, _newAdmin);
    }

    /**
     * @dev This will nullify all pod state on this controller
     * @dev Update state on _newController
     * @dev Update controller to _newController in Safe and MemberToken
     * @param _podId The id number of the pod
     * @param _newController The address of the new pod controller
     * @param _prevModule The module that points to the orca module in the safe's ModuleManager linked list
     */
    function migratePodController(
        uint256 _podId,
        address _newController,
        address _prevModule
    ) external {
        require(_newController != address(0), "Invalid address");
        require(
            controllerRegistry.isRegistered(_newController),
            "Controller not registered"
        );

        address admin = podAdmin[_podId];
        address safe = podIdToSafe[_podId];

        require(
            msg.sender == admin || msg.sender == safe,
            "User not authorized"
        );

        // Update ENS controller data
        // TODO: Uncomment this john
        // bytes32 node = podEnsRegistrar.addressToNode(safe);
        // require(node != bytes32(0), "safe was not ens registered");
        // podEnsRegistrar.setPodController(
        //     node,
        //     toAsciiString(_newController)
        // );

        Controller newController = Controller(_newController);

        // nullify current pod state
        podAdmin[_podId] = address(0);
        podIdToSafe[_podId] = address(0);
        safeToPodId[safe] = 0;
        // update controller in MemberToken
        memberToken.migrateMemberController(_podId, _newController);
        // update safe module to _newController
        migrateSafeTeller(safe, _newController, _prevModule);
        // update pod state in _newController
        newController.updatePodState(_podId, admin, safe);
    }

    /**
     * @dev This is called by another version of controller to migrate a pod to this version
     * @dev Will only accept calls from registered controllers
     * @dev Can only be called once.
     * @param _podId The id number of the pod
     * @param _podAdmin The address of the pod admin
     * @param _safeAddress The address of the safe
     */
    function updatePodState(
        uint256 _podId,
        address _podAdmin,
        address _safeAddress
    ) external {
        require(_safeAddress != address(0), "Invalid address");
        require(
            controllerRegistry.isRegistered(msg.sender),
            "Controller not registered"
        );
        require(
            podAdmin[_podId] == address(0) &&
                podIdToSafe[_podId] == address(0) &&
                safeToPodId[_safeAddress] == 0,
            "Pod already exists"
        );
        podAdmin[_podId] = _podAdmin;
        podIdToSafe[_podId] = _safeAddress;
        safeToPodId[_safeAddress] = _podId;

        emit UpdatePodAdmin(_podId, _podAdmin);
    }

    /**
     * @param operator The address that initiated the action
     * @param from The address sending the membership token
     * @param to The address recieveing the membership token
     * @param ids An array of membership token ids to be transfered
     * @param data Passes a flag for an initial creation event
     */
    function beforeTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory,
        bytes memory data
    ) external override {
        require(msg.sender == address(memberToken), "Not Authorized");

        // if create event than side effects have been pre-handled
        // only recognise data flags from this controller
        if (operator == address(this) && uint8(data[0]) == CREATE_EVENT) return;

        for (uint256 i = 0; i < ids.length; i += 1) {
            uint256 podId = ids[i];
            address safe = podIdToSafe[podId];
            address admin = podAdmin[podId];

            if (from == address(0)) {
                // mint event

                // there are no rules operator must be admin, safe or controller
                require(
                    operator == safe ||
                        operator == admin ||
                        operator == address(this),
                    "No Rules Set"
                );

                onMint(to, safe);
            } else if (to == address(0)) {
                // burn event

                // there are no rules  operator must be admin, safe or controller
                require(
                    operator == safe ||
                        operator == admin ||
                        operator == address(this),
                    "No Rules Set"
                );

                onBurn(from, safe);
            } else {
                // transfer event
                onTransfer(from, to, safe);
            }
        }
    }
}
