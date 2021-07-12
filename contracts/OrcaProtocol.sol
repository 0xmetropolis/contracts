pragma solidity 0.7.4;

/* solhint-disable indent */

import "./MemberToken.sol";
import "./OwnerToken.sol";
import "./RuleManager.sol";
import "./SafeTeller.sol";

import "hardhat/console.sol";

// TODO: consider  order of contract  deployment. May not want to deploy all together
// this will impact the modifiers that are important for securiy
// for not deploying supporting contracts as part of main contract

contract OrcaProtocol {
    event RuleManagerAddress(address contractAddress);
    event MemberTokenAddress(address contractAddress);
    event CreatePod(uint256 podId);

    address memberToken;
    RuleManager ruleManager;
    SafeTeller safeTeller;
    OwnerToken ownerToken;

    mapping(uint256 => address) public safeAddress;

    constructor(
        address _memberToken,
        address _ruleManager,
        address _safeTeller,
        address _ownerToken
    ) public {
        memberToken = _memberToken;
        ruleManager = RuleManager(_ruleManager);
        safeTeller = SafeTeller(_safeTeller);
        ownerToken = OwnerToken(_ownerToken);
    }

    /*
     * This function creates a pod, assigns one token to the sender of the message,
     * and sets the initial rules for that pod.
     */
    function createPod(
        uint256 _podId,
        address[] memory _members,
        uint256 threshold,
        address _owner
    ) public {
        if (_owner != address(0)) {
            ownerToken.mint(_owner, _podId);
        }
        safeAddress[_podId] = safeTeller.createSafe(
            _podId,
            _members,
            threshold
        );

        if (_members.length != 0) {
            MemberToken(memberToken).mintSingleBatch(
                _members,
                _podId,
                bytes("0x1")
            );
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
            msg.sender == ownerToken.ownerOf(_podId) ||
                msg.sender == safeAddress[_podId],
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

    function beforeTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) public {
        for (uint256 i = 0; i < ids.length; i += 1) {
            uint256 podId = ids[i];
            address safe = safeAddress[podId];
            address owner = ownerToken.ownerOf(podId);

            // mint event
            if (from == address(0)) {
                // if there are rules recipient must be rule compliant
                if (ruleManager.hasRules(podId)) {
                    require(
                        ruleManager.isRuleCompliant(podId, to),
                        "Not Rule Compliant"
                    );
                    // if there are no rules operator must be owner, safe or controller
                } else {
                    require(
                        operator == safe ||
                            operator == owner ||
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
                    // if there are no rules operator must be owner, safe or controller
                } else {
                    require(
                        operator == safe ||
                            operator == owner ||
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

                safeTeller.onTransfer(operator, from, to, safe);
            }
        }
    }
}
