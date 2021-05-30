pragma solidity 0.7.4;

/* solhint-disable indent */

import "./MemberToken.sol";
import "./VoteManager.sol";
import "./RuleManager.sol";
import "./SafeTeller.sol";

import "hardhat/console.sol";

// TODO: consider  order of contract  deployment. May not want to deploy all together
// this will impact the modifiers that are important for securiy
// for not deploying supporting contracts as part of main contract

// TODO: custom implementation of erc1155
// enable defining your own podId
// enable transfer of the podId token
// only allow for one token per user

contract OrcaProtocol {
    event RuleManagerAddress(address contractAddress);
    event MemberTokenAddress(address contractAddress);
    event VoteManagerAddress(address contractAddress);
    event CreatePod(uint256 podId);

    address memberToken;
    VoteManager voteManager;
    RuleManager ruleManager;
    SafeTeller safeTeller;

    mapping(uint256 => address) public safeAddress;

    constructor(
        address _memberToken,
        address _voteManager,
        address _ruleManager,
        address _safeTeller
    ) public {
        memberToken = _memberToken;
        voteManager = VoteManager(_voteManager);
        ruleManager = RuleManager(_ruleManager);
        safeTeller = SafeTeller(_safeTeller);
    }

    /*
     * This function creates a pod, assigns one token to the sender of the message,
     * and sets the initial rules for that pod.
     */
    function createPod(
        address _owner,
        // should auto gen podId
        uint256 _podId,
        uint256 _minVotingPeriod,
        uint256 _maxVotingPeriod,
        uint256 _minQuorum,
        uint256 _maxQuorum
    ) public {
        //Alow for abitrary owners
        MemberToken(memberToken).mint(_owner, _podId, " ");

        voteManager.createVotingStrategy(
            _podId,
            _minVotingPeriod,
            _maxVotingPeriod,
            _minQuorum,
            _maxQuorum
        );
        address podSafe = safeTeller.createSafe(_podId);

        safeAddress[_podId] = podSafe;

        emit CreatePod(_podId);
    }

    function createRuleProposal(
        uint256 _podId,
        address _contractAddress,
        bytes4 _functionSignature,
        bytes32[5] memory _functionParams,
        uint256 _comparisonLogic,
        uint256 _comparisonValue
    ) public {
        require(
            MemberToken(memberToken).balanceOf(msg.sender, _podId) != 0,
            "User lacks power"
        );

        ruleManager.setPodRule(
            _podId,
            _contractAddress,
            _functionSignature,
            _functionParams,
            _comparisonLogic,
            _comparisonValue
        );

        voteManager.createProposal(_podId, msg.sender, 0, _podId);
    }

    function createActionProposal(
        uint256 _podId,
        address _to,
        uint256 _value,
        bytes memory _data
    ) public {
        require(
            MemberToken(memberToken).balanceOf(msg.sender, _podId) != 0,
            "User lacks power"
        );

        safeTeller.createPendingAction(_podId, _to, _value, _data);

        voteManager.createProposal(_podId, msg.sender, 1, _podId);
    }

    function approve(
        uint256 _proposalId,
        uint256 _podId,
        address _voter
    ) public {
        require(msg.sender == _voter, "voter is invalid");

        require(
            MemberToken(memberToken).balanceOf(_voter, _podId) != 0,
            "User lacks power"
        );

        voteManager.approveProposal(_proposalId, _podId, _voter);
    }

    function finalizeProposal(uint256 _proposalId, uint256 _podId) public {
        // proposalType 0 = rule, 1 = action
        (uint256 proposalType, uint256 executableId) =
            voteManager.passProposal(_proposalId, _podId);

        if (proposalType == 0) {
            ruleManager.finalizeRule(executableId);
        }
        if (proposalType == 1) {
            safeTeller.executeAction(_podId, safeAddress[_podId]);
        }
    }

    function beforeTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) public {
        if (operator == memberToken) {
            for (uint256 i = 0; i < ids.length; i += 1) {
                require(
                    ruleManager.isRuleCompliant(ids[i], to),
                    "Not Rule Compliant"
                );
            }
        }
    }

    function claimMembership(uint256 _podId) public {
        require(
            ruleManager.isRuleCompliant(_podId, msg.sender),
            "Not Rule Compliant"
        );
        MemberToken(memberToken).mint(msg.sender, _podId, " ");
    }

    function retractMembership(uint256 _podId, address _member) public {
        require(
            !ruleManager.isRuleCompliant(_podId, _member),
            "Rule Compliant"
        );

        MemberToken(memberToken).burn(_member, _podId);
    }
}
