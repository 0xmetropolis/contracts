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

    constructor(address _orcaMemberTokenAddress)
        public
    // address OrcaPodManagerAddress,
    // address OrcaVotingManagerAddress,
    {
        orcaPodManager = new OrcaPodManager(_orcaMemberTokenAddress);
        emit PodManagerAddress(address(orcaPodManager));

        orcaVoteManager = new OrcaVoteManager(orcaPodManager);
        emit VoteManagerAddress(address(orcaVoteManager));

        orcaPodManager.setVoteManager(address(orcaVoteManager));

        console.log(address(orcaPodManager));
    }

    function createPod(
        uint256 _podId,
        uint256 _totalSupply,
        address _erc20Address,
        uint256 _minimumBalance,
        uint256 _votingPeriod,
        uint256 _minQuorum
    ) public {
        // add a require to confirm minting was successful otherwise revert
        orcaPodManager.createPod(
            _podId,
            _totalSupply,
            _erc20Address,
            _minimumBalance
        );

        orcaVoteManager.createVotingStrategy(_podId, _votingPeriod, _minQuorum);
        emit CreatePod(_podId);
    }
}
