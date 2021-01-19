pragma solidity 0.7.4;

contract OrcaVoteManager {
    address deployer;

    struct podVotingRules {
        uint256 votingPeriod; // number of blocks.
        uint256 minQuorum; // minumum number of votes needed to pass.
    }

    mapping(uint256 => podVotingRules) public votingRulesByPod;

    constructor() public {
        deployer = msg.sender;
    }

    // probably a better way to manage  this
    // dependent on how we are managing contract deployment
    modifier onlyProtocol {
        require(
            msg.sender == deployer,
            "Only OrcaProtocol can call this function."
        );
        _;
    }

    function createVotingRule(
        uint256 podId,
        uint256 votingPeriod,
        uint256 minQuorum
    ) public onlyProtocol {
        // Only gets call on pod create
        votingRulesByPod[podId] = podVotingRules(votingPeriod, minQuorum);
    }
}
