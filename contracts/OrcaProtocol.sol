pragma solidity 0.7.4;

/* solhint-disable indent */

import "hardhat/console.sol";
import "./PodManager.sol";
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
    event PodManagerAddress(address contractAddress);
    event VoteManagerAddress(address contractAddress);
    event CreatePod(uint256 podId);

    PodManager podManager;
    VoteManager voteManager;
    RuleManager rulemanager;

    constructor() public // address PodManagerAddress,
    // address OrcaVotingManagerAddress,
    {
        rulemanager = new RuleManager();
        emit RuleManagerAddress(address(rulemanager));

        podManager = new PodManager(rulemanager);
        emit PodManagerAddress(address(podManager));

        voteManager = new VoteManager(rulemanager);
        emit VoteManagerAddress(address(voteManager));

        podManager.setVoteManager(address(voteManager));
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
        podManager.createPod(msg.sender, _podId, _totalSupply);

        voteManager.setupPodVotingAndSafe(
            _podId,
            _votingPeriod,
            _minQuorum,
            _gnosisMasterContract
        );
        emit CreatePod(_podId);
    }
}
