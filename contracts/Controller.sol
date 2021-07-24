pragma solidity 0.7.4;

/* solhint-disable indent */

import "./interfaces/IMemberToken.sol";
import "./RuleManager.sol";
import "./SafeTeller.sol";
import "./interfaces/IControllerRegistry.sol";

// TODO: consider  order of contract  deployment. May not want to deploy all together
// this will impact the modifiers that are important for securiy
// for not deploying supporting contracts as part of main contract

contract Controller {
    event RuleManagerAddress(address contractAddress);
    event MemberTokenAddress(address contractAddress);
    event CreatePod(uint256 podId);

    IMemberToken memberToken;
    RuleManager ruleManager;
    SafeTeller safeTeller;
    IControllerRegistry controllerRegistry;

    mapping(uint256 => address) public safeAddress;
    mapping(uint256 => address) public podAdmin;

    uint8 CREATE_EVENT = 0x01;

    constructor(
        address _memberToken,
        address _ruleManager,
        address _safeTeller,
        address _controllerRegistry
    ) public {
        memberToken = IMemberToken(_memberToken);
        ruleManager = RuleManager(_ruleManager);
        safeTeller = SafeTeller(_safeTeller);
        controllerRegistry = IControllerRegistry(_controllerRegistry);
    }

    /*
     * This function creates a pod, assigns one token to the sender of the message,
     * and sets the initial rules for that pod.
     */
    function createPod(
        uint256 _podId,
        address[] memory _members,
        uint256 threshold,
        address _admin
    ) public {
        require(memberToken.exists(_podId) == false, "pod already exists");

        if (_admin != address(0)) podAdmin[_podId] = _admin;

        safeAddress[_podId] = safeTeller.createSafe(
            _podId,
            _members,
            threshold
        );

        if (_members.length != 0) {
            // add create event flag to token data
            bytes memory data = new bytes(1);
            data[0] = bytes1(uint8(CREATE_EVENT));

            memberToken.mintSingleBatch(_members, _podId, data);
        }

        emit CreatePod(_podId);
    }

    function createRule(
        uint256 _podId,
        address _contractAddress,
        bytes4 _functionSignature,
        bytes32[5] memory _functionParams,
        uint256 _comparisonLogic,
        uint256 _comparisonValue
    ) public {
        //TODO: executable id
        uint256 fakeExeId = 99;
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

    function getSafeTeller() public view returns (address) {
        return address(safeTeller);
    }

    function migratePodController(uint256 _podId, address _newController)
        public
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

        memberToken.migrateMemberController(_podId, _newController);
        safeTeller.migrateSafeTeller(safe, newController.getSafeTeller());
        newController.updatePodState(_podId, admin, safe);

        podAdmin[_podId] = address(0);
        safeAddress[_podId] = address(0);
    }

    function updatePodState(
        uint256 _podId,
        address _podAdmin,
        address _safeAddress
    ) public {
        require(
            controllerRegistry.isRegistered(msg.sender),
            "Controller not registered"
        );
        podAdmin[_podId] = _podAdmin;
        safeAddress[_podId] = _safeAddress;
    }

    function beforeTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) public {
        // if create even than side effects have been pre-handled
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
