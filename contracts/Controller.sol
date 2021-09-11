pragma solidity 0.8.7;

/* solhint-disable indent */

import "./interfaces/IController.sol";
import "./interfaces/IMemberToken.sol";
import "./interfaces/IControllerRegistry.sol";
import "./SafeTeller.sol";

contract Controller is IController, SafeTeller {
    event CreatePod(uint256 podId);

    IMemberToken public memberToken;
    IControllerRegistry public controllerRegistry;

    mapping(uint256 => address) public safeAddress;
    mapping(uint256 => address) public podAdmin;

    uint8 internal constant CREATE_EVENT = 0x01;

    /**
     * @param _memberToken The address of the MemberToken contract
     * @param _controllerRegistry The address of the ControllerRegistry contract
     * @param _proxyFactoryAddress The proxy factory address
     * @param _gnosisMasterAddress The gnosis master address
     */
    constructor(
        address _memberToken,
        address _controllerRegistry,
        address _proxyFactoryAddress,
        address _gnosisMasterAddress
    ) {
        memberToken = IMemberToken(_memberToken);
        controllerRegistry = IControllerRegistry(_controllerRegistry);
        setupSafeTeller(_proxyFactoryAddress, _gnosisMasterAddress);
    }

    /**
     * @param _members The addresses of the members of the pod
     * @param threshold The number of members that are required to sign a transaction
     * @param _admin The address of the pod admin
     */
    function createPod(
        address[] memory _members,
        uint256 threshold,
        address _admin
    ) external {
        // add create event flag to token data
        bytes memory data = new bytes(1);
        data[0] = bytes1(uint8(CREATE_EVENT));

        uint256 podId = memberToken.createPod(_members, data);

        if (_admin != address(0)) podAdmin[podId] = _admin;

        emit CreatePod(podId);

        safeAddress[podId] = createSafe(podId, _members, threshold);
    }

    /**
     * @dev Used to create a pod with an existing safe
     * @dev Will automatically distribute membership NFTs to current safe members
     * @param _admin The address of the pod admin
     * @param _safe The address of existing safe
     */
    function createPodWithSafe(address _admin, address _safe) external {
        uint256 podId = memberToken.getNextAvailablePodId();
        require(_safe != address(0), "invalid safe address");
        require(isSafeModuleEnabled(_safe), "safe module must be enabled");
        require(
            isSafeMember(_safe, msg.sender) || msg.sender == _safe,
            "caller must be safe or member"
        );

        if (_admin != address(0)) podAdmin[podId] = _admin;

        emit CreatePod(podId);

        safeAddress[podId] = _safe;

        address[] memory members = getSafeMembers(_safe);

        // add create event flag to token data
        bytes memory data = new bytes(1);
        data[0] = bytes1(uint8(CREATE_EVENT));

        memberToken.createPod(members, data);
    }

    /**
     * @param _podId The id number of the pod
     * @param _newAdmin The address of the new pod admin
     */
    function updatePodAdmin(uint256 _podId, address _newAdmin) external {
        address admin = podAdmin[_podId];
        address safe = safeAddress[_podId];

        require(safe != address(0), "Pod doesn't exist");

        // if there is no admin it can only be added by safe
        if (admin == address(0)) {
            require(msg.sender == safe, "Only safe can add new admin");
        } else {
            require(msg.sender == admin, "Only admin can update admin");
        }
        safeAddress[_podId] = _newAdmin;
    }

    /**
     * @param _podId The id number of the pod
     * @param _newController The address of the new pod controller
     */
    function migratePodController(uint256 _podId, address _newController)
        external
    {
        require(
            controllerRegistry.isRegistered(_newController),
            "Controller not registered"
        );

        address admin = podAdmin[_podId];
        address safe = safeAddress[_podId];

        require(
            msg.sender == admin || msg.sender == safe,
            "User not authorized"
        );


        Controller newController = Controller(_newController);

        podAdmin[_podId] = address(0);
        safeAddress[_podId] = address(0);

        memberToken.migrateMemberController(_podId, _newController);
        migrateSafeTeller(safe, _newController);
        newController.updatePodState(_podId, admin, safe);
    }

    /**
     * @param _podId The id number of the pod
     * @param _podAdmin The address of the pod admin
     * @param _safeAddress The address of the safe
     */
    function updatePodState(
        uint256 _podId,
        address _podAdmin,
        address _safeAddress
    ) external {
        require(
            controllerRegistry.isRegistered(msg.sender),
            "Controller not registered"
        );
        podAdmin[_podId] = _podAdmin;
        safeAddress[_podId] = _safeAddress;
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
            address safe = safeAddress[podId];
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
