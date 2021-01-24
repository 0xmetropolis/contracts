pragma solidity 0.7.4;

/* solhint-disable indent */

import "hardhat/console.sol";
import "./OrcaPodManager.sol";
import "./OrcaVoteManager.sol";
import "./OrcaMemberToken.sol";

import "hardhat/console.sol";

// TODO: consider  order of contract  deployment. May not want to deploy all together
// this will impact the modifiers that are important for securiy
// for not deploying supporting contracts as part of main contract

// TODO: custom implementation of erc1155
// enable defining your own podId
// enable transfer of the podId token
// only allow for one token per user

contract OrcaProtocol {
    event PodManagerAddress(address contractAddress);
    event VoteManagerAddress(address contractAddress);
    event CreatePod(uint256 podId);

    OrcaPodManager orcaPodManager;
    OrcaVoteManager orcaVoteManager;
    OrcaMemberToken orcaMemberToken;

    constructor(address orcaMemberTokenAddress)
        public
    // address OrcaPodManagerAddress,
    // address OrcaVotingManagerAddress,
    {
        orcaMemberToken = OrcaMemberToken(orcaMemberTokenAddress);

        orcaPodManager = new OrcaPodManager(orcaMemberToken);
        emit PodManagerAddress(address(orcaPodManager));

        orcaVoteManager = new OrcaVoteManager(orcaPodManager);
        emit VoteManagerAddress(address(orcaVoteManager));

        orcaPodManager.setVoteManager(address(orcaVoteManager));

        console.log(address(orcaPodManager));
    }

    function createPod(
        uint256 podId,
        uint256 totalSupply,
        address erc20Address,
        uint256 minimumBalance,
        uint256 votingPeriod,
        uint256 minQuorum
    ) public {
        orcaMemberToken.mint(
            address(orcaPodManager),
            podId,
            totalSupply,
            bytes("bytes test")
        );
        orcaPodManager.createPodRule(podId, erc20Address, minimumBalance);
        orcaVoteManager.createVotingStrategy(podId, votingPeriod, minQuorum);
        emit CreatePod(podId);
    }
}
