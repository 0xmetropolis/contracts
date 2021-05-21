pragma solidity 0.7.4;

/* solhint-disable indent */

import "./PowerBank.sol";
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
    event PowerBankAddress(address contractAddress);
    event VoteManagerAddress(address contractAddress);
    event CreatePod(uint256 podId);

    PowerBank powerBank;
    VoteManager voteManager;
    RuleManager ruleManager;
    SafeTeller safeTeller;

    mapping(uint256 => address) public safeAddress;

    constructor(
        address _powerBank,
        address _voteManager,
        address _ruleManager,
        address _safeTeller
    ) public {
        powerBank = PowerBank(_powerBank);
        voteManager = VoteManager(_voteManager);
        ruleManager = RuleManager(_ruleManager);
        safeTeller = SafeTeller(_safeTeller);
    }

    /*
     * This function creates a pod, assigns one token to the sender of the message,
     * and sets the initial rules for that pod.
     */
    function createPod(
        uint256 _podId,
        uint256 _minVotingPeriod,
        uint256 _maxVotingPeriod,
        uint256 _minQuorum,
        uint256 _maxQuorum,
        uint256 _totalSupply
    ) public {
        // add a require to confirm minting was successful otherwise revert
        powerBank.createPod(msg.sender, _podId, _totalSupply);

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
            powerBank.getPower(msg.sender, _podId) != 0,
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
            powerBank.getPower(msg.sender, _podId) != 0,
            "User lacks power"
        );

        safeTeller.createPendingAction(_podId, _to, _value, _data);

        voteManager.createProposal(_podId, msg.sender, 1, _podId);
    }

    function approve(
        uint256 _podId,
        uint256 _proposalId,
        address _voter
    ) public {
        require(msg.sender == _voter, "voter is invalid");

        require(powerBank.getPower(_voter, _podId) != 0, "User lacks power");

        voteManager.approveProposal(_podId, _proposalId, _voter);
    }

    function finalizeProposal(uint256 _podId, uint256 _proposalId) public {
        // proposalType 0 = rule, 1 = action
        (bool didPass, uint256 proposalType, uint256 executableId) =
            voteManager.finalizeProposal(_podId, _proposalId);

        if (didPass) {
            if (proposalType == 0) {
                ruleManager.finalizeRule(executableId);
            }
            if (proposalType == 1) {
                safeTeller.executeAction(_podId, safeAddress[_podId]);
            }
        }
    }

    function claimMembership(uint256 _podId) public {
        require(
            ruleManager.isRuleCompliant(_podId, msg.sender),
            "Not Rule Compliant"
        );
        powerBank.claimMembership(msg.sender, _podId);
    }

    function retractMembership(uint256 _podId, address _member) public {
        require(
            !ruleManager.isRuleCompliant(_podId, _member),
            "Rule Compliant"
        );

        powerBank.retractMembership(_podId, _member);
    }
}
