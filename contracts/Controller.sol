pragma solidity 0.7.4;

/* solhint-disable indent */

import "./interfaces/IController.sol";
import "./interfaces/IMemberToken.sol";
import "./RuleManager.sol";
import "./SafeTeller.sol";
import "./interfaces/IControllerRegistry.sol";

// TODO: consider  order of contract  deployment. May not want to deploy all together
// this will impact the modifiers that are important for securiy
// for not deploying supporting contracts as part of main contract

contract Controller is IController {
    event RuleManagerAddress(address contractAddress);
    event MemberTokenAddress(address contractAddress);
    event CreatePod(uint256 podId);

    IMemberToken public memberToken;
    RuleManager public ruleManager;
    SafeTeller public safeTeller;
    IControllerRegistry public controllerRegistry;

    mapping(uint256 => address) public safeAddress;
    mapping(uint256 => address) public podAdmin;

    uint8 internal constant CREATE_EVENT = 0x01;

    /**
     * @param _memberToken The address of the MemberToken contract
     * @param _ruleManager The address of the RuleManager contract
     * @param _safeTeller The address of the SafeTeller contract
     * @param _controllerRegistry The address of the ControllerRegistry contract
     */
    constructor(
        address _memberToken,
        address _ruleManager,
        address _safeTeller,
        address _controllerRegistry
    ) {
        memberToken = IMemberToken(_memberToken);
        ruleManager = RuleManager(_ruleManager);
        safeTeller = SafeTeller(_safeTeller);
        controllerRegistry = IControllerRegistry(_controllerRegistry);
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
        uint256 podId = memberToken.getNextAvailablePodId();

        if (_admin != address(0)) podAdmin[podId] = _admin;

        emit CreatePod(podId);

        safeAddress[podId] = safeTeller.createSafe(podId, _members, threshold);

        // add create event flag to token data
        bytes memory data = new bytes(1);
        data[0] = bytes1(uint8(CREATE_EVENT));

        memberToken.createPod(_members, data);
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
        require(
            safeTeller.isModuleEnabled(_safe),
            "safe module must be enabled"
        );

        if (_admin != address(0)) podAdmin[podId] = _admin;

        emit CreatePod(podId);

        safeAddress[podId] = _safe;

        address[] memory members = safeTeller.getMembers(_safe);

        // add create event flag to token data
        bytes memory data = new bytes(1);
        data[0] = bytes1(uint8(CREATE_EVENT));

        memberToken.createPod(members, data);
    }

    function createRule(
        uint256 _podId,
        address _contractAddress,
        bytes4 _functionSignature,
        bytes32[5] memory _functionParams,
        uint256 _comparisonLogic,
        uint256 _comparisonValue
    ) external {
        //TODO: executable id
        require(
            msg.sender == podAdmin[_podId] || msg.sender == safeAddress[_podId],
            "User not authorized"
        );

        ruleManager.setPodRule(
            _podId,
            _contractAddress,
            _functionSignature,
            _functionParams,
            _comparisonLogic,
            _comparisonValue
        );

        ruleManager.finalizeRule(_podId);
    }

    /**
     * @return The address of the safe teller contract
     */
    function getSafeTeller() external view returns (address) {
        return address(safeTeller);
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
        safeTeller.migrateSafeTeller(safe, newController.getSafeTeller());
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
     * @param amounts The amount of each membership token type to transfer
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
        // no data field on burn
        if (to != address(0) && uint8(data[0]) == CREATE_EVENT) return;

        for (uint256 i = 0; i < ids.length; i += 1) {
            uint256 podId = ids[i];
            address safe = safeAddress[podId];
            address admin = podAdmin[podId];

            // mint event
            if (from == address(0)) {
                // if there are rules recipient must be rule compliant
                if (ruleManager.hasRules(podId)) {
                    require(
                        ruleManager.isRuleCompliant(podId, to),
                        "Not Rule Compliant"
                    );
                    // if there are no rules operator must be admin, safe or controller
                } else {
                    require(
                        operator == safe ||
                            operator == admin ||
                            operator == address(this),
                        "No Rules Set"
                    );
                }
                safeTeller.onMint(to, safe);

                // burn event
            } else if (to == address(0)) {
                // if there are rules terminee must not be rule compliant
                if (ruleManager.hasRules(podId)) {
                    require(
                        ruleManager.isRuleCompliant(podId, from) == false,
                        "Rule Compliant"
                    );
                    // if there are no rules operator must be admin, safe or controller
                } else {
                    require(
                        operator == safe ||
                            operator == admin ||
                            operator == address(this),
                        "No Rules Set"
                    );
                }

                safeTeller.onBurn(from, safe);

                // transfer event
            } else {
                require(
                    ruleManager.isRuleCompliant(podId, to),
                    "Not Rule Compliant"
                );

                safeTeller.onTransfer(from, to, safe);
            }
        }
    }
}
