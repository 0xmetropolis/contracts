pragma solidity 0.7.4;

/* solhint-disable indent */

import "hardhat/console.sol";
import "./OrcaPodManager.sol";
import "./OrcaVoteManager.sol";
import "./OrcaRulebook.sol";

import "hardhat/console.sol";

// TODO: consider  order of contract  deployment. May not want to deploy all together
// this will impact the modifiers that are important for securiy
// for not deploying supporting contracts as part of main contract

// TODO: custom implementation of erc1155
// enable defining your own podId
// enable transfer of the podId token
// only allow for one token per user

contract OrcaProtocol {
    event RulebookAddress(address contractAddress);
    event PodManagerAddress(address contractAddress);
    event VoteManagerAddress(address contractAddress);
    event CreatePod(uint256 podId);

    OrcaPodManager orcaPodManager;
    OrcaVoteManager orcaVoteManager;
    OrcaRulebook orcaRulebook;

    constructor() public // address OrcaPodManagerAddress,
    // address OrcaVotingManagerAddress,
    {
        orcaRulebook = new OrcaRulebook();
        emit RulebookAddress(address(orcaRulebook));

        orcaPodManager = new OrcaPodManager(orcaRulebook);
        emit PodManagerAddress(address(orcaPodManager));

        orcaVoteManager = new OrcaVoteManager(orcaPodManager, orcaRulebook);
        emit VoteManagerAddress(address(orcaVoteManager));

        orcaPodManager.setVoteManager(address(orcaVoteManager));
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
        orcaPodManager.createPod(msg.sender, _podId, _totalSupply);

        orcaVoteManager.setupPodVotingAndSafe(
            _podId,
            _votingPeriod,
            _minQuorum,
            _gnosisMasterContract
        );
        emit CreatePod(_podId);
    }
}
