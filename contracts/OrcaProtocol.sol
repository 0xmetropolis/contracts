pragma solidity 0.7.4;

/* solhint-disable indent */

import "hardhat/console.sol";
import "./PowerBank.sol";
import "./VoteManager.sol";
import "./RuleManager.sol";

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

    constructor(address _powerBank, address _voteManager, address _ruleManager) public {
        powerBank = PowerBank(_powerBank);
        voteManager = VoteManager(_voteManager);
        ruleManager = RuleManager(_ruleManager);
    }

    /*
     * This function creates a pod, assigns one token to the sender of the message,
     * and sets the initial rules for that pod.
     */
    function createPod(
        uint256 _podId,
        uint256 _totalSupply,
        uint256 _votingPeriod,
        uint256 _minQuorum,
        address _gnosisMasterContract
    ) public {
        // add a require to confirm minting was successful otherwise revert
        powerBank.createPod(msg.sender, _podId, _totalSupply);

        voteManager.setupPodVotingAndSafe(
            _podId,
            _votingPeriod,
            _minQuorum,
            _gnosisMasterContract
        );
        emit CreatePod(_podId);
    }

    function claimMembership(uint256 _podId) public {
        require(
            ruleManager.isRuleCompliant(_podId, msg.sender),
            "Not Rule Compliant"
        );
        powerBank.claimMembership(msg.sender, _podId);
    }

    function retractMembership(uint256 _podId, address _member) public {
        require(!ruleManager.isRuleCompliant(_podId, _member), "Rule Compliant");

        powerBank.retractMembership(_podId, _member);
    }
}
