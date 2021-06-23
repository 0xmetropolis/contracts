pragma solidity 0.7.4;

/* solhint-disable indent */

import "./MemberToken.sol";
import "./OwnerToken.sol";
import "./VoteManager.sol";
import "./RuleManager.sol";
import "./SafeTeller.sol";

import "hardhat/console.sol";

// TODO: consider  order of contract  deployment. May not want to deploy all together
// this will impact the modifiers that are important for securiy
// for not deploying supporting contracts as part of main contract

contract OrcaProtocol {
    event RuleManagerAddress(address contractAddress);
    event MemberTokenAddress(address contractAddress);
    event VoteManagerAddress(address contractAddress);
    event CreatePod(uint256 podId);

    address memberToken;
    VoteManager voteManager;
    RuleManager ruleManager;
    SafeTeller safeTeller;
    OwnerToken ownerToken;

    mapping(uint256 => address) public safeAddress;

    constructor(
        address _memberToken,
        address _voteManager,
        address _ruleManager,
        address _safeTeller,
        address _ownerToken
    ) public {
        memberToken = _memberToken;
        voteManager = VoteManager(_voteManager);
        ruleManager = RuleManager(_ruleManager);
        safeTeller = SafeTeller(_safeTeller);
        ownerToken = OwnerToken(_ownerToken);
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
        ownerToken.mint(_owner, _podId);

        uint256 strategyId =
            voteManager.createVotingStrategy(
                _minVotingPeriod,
                _maxVotingPeriod,
                _minQuorum,
                _maxQuorum
            );

        voteManager.finalizeVotingStrategy(_podId, strategyId);

        address podSafe = safeTeller.createSafe(_podId);

        safeAddress[_podId] = podSafe;

        emit CreatePod(_podId);
    }

    function createActionProposal(
        uint256 _podId,
        address _to,
        uint256 _value,
        bytes memory _data
    ) public {
        //TODO: executable id
        uint256 fakeExeId = 99;
        require(
            MemberToken(memberToken).balanceOf(msg.sender, _podId) != 0,
            "User lacks power"
        );

        safeTeller.createPendingAction(_podId, _to, _value, _data);

        voteManager.createProposal(_podId, msg.sender, 1, fakeExeId);
    }

    function createRuleProposal(
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

        voteManager.createProposal(_podId, msg.sender, 0, fakeExeId);
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
        require(ownerToken.ownerOf(_podId) == msg.sender, "User is not owner");

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

    function createStrategyProposal(
        uint256 _podId,
        uint256 _minVotingPeriod,
        uint256 _maxVotingPeriod,
        uint256 _minQuorum,
        uint256 _maxQuorum
    ) public {
        require(
            MemberToken(memberToken).balanceOf(msg.sender, _podId) != 0,
            "User lacks power"
        );

        uint256 strategyId =
            voteManager.createVotingStrategy(
                _minVotingPeriod,
                _maxVotingPeriod,
                _minQuorum,
                _maxQuorum
            );

        voteManager.createProposal(_podId, msg.sender, 2, strategyId);
    }

    function createStrategy(
        uint256 _podId,
        uint256 _minVotingPeriod,
        uint256 _maxVotingPeriod,
        uint256 _minQuorum,
        uint256 _maxQuorum
    ) public {
        require(ownerToken.ownerOf(_podId) == msg.sender, "User is not owner");

        uint256 strategyId =
            voteManager.createVotingStrategy(
                _minVotingPeriod,
                _maxVotingPeriod,
                _minQuorum,
                _maxQuorum
            );

        voteManager.finalizeVotingStrategy(_podId, strategyId);
    }

    function approve(
        uint256 _proposalId,
        uint256 _podId,
        address _account
    ) public {
        require(msg.sender == _account, "voter is invalid");

        require(
            MemberToken(memberToken).balanceOf(_account, _podId) != 0,
            "User lacks power"
        );

        voteManager.approveProposal(_proposalId, _podId, _account);
    }

    function challenge(
        uint256 _proposalId,
        uint256 _podId,
        address _account
    ) public {
        require(msg.sender == _account, "voter is invalid");

        require(
            MemberToken(memberToken).balanceOf(_account, _podId) != 0,
            "User lacks power"
        );

        voteManager.challengeProposal(_proposalId, _podId, _account);
    }

    //TODO: Break this function in half seeps to be expensive

    function finalizeProposal(uint256 _proposalId, uint256 _podId) public {
        // proposalType 0 = rule, 1 = action, 2 = strategy
        (uint256 proposalType, uint256 executableId) =
            voteManager.passProposal(_proposalId, _podId);

        if (proposalType == 0) {
            ruleManager.finalizeRule(_podId);
        }
        if (proposalType == 1) {
            //TODO: finalize, but don't execute
            safeTeller.executeAction(_podId, safeAddress[_podId]);
        }
        if (proposalType == 2) {
            voteManager.finalizeVotingStrategy(_podId, executableId);
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
