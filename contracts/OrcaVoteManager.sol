pragma solidity 0.7.4;

/* solhint-disable indent */

contract OrcaVoteManager {
    address deployer;

    // Vote Strategys
    struct PodVoteStrategy {
        uint256 votingPeriod; // number of blocks.
        uint256 minQuorum; // minimum number of votes needed to ratify.
    }

    mapping(uint256 => PodVoteStrategy) public voteStrategiesByPod;

    event CreateVoteStrategy(uint256 podId, uint256 votingPeriod, uint256 minQuorum);

    // Vote Proposals 
    struct PodVoteProposal {
        uint256 propoalBlock; // block number of proposal
        uint256 minQuorumCalc; // minQuorum minus outstanding memberships

        mapping(address => bool) hasVoted; // registering that someone has voted
        uint256 approveVotes; // number of votes for proposal
        uint256 rejectVotes; // number of votes against proposal

        bool ratified; // has the final vote been tallied
    }

    mapping(uint256 => PodVoteProposal) public voteProposalByPod;

    constructor() public {
        deployer = msg.sender;
    }
    
    function createProposal(){
    }

    function createVotingStrategy(
        uint256 podId,
        uint256 votingPeriod,
        uint256 minQuorum
    ) public {
        // TODO: add auth protection
        // Only gets call on pod create
        voteStrategiesByPod[podId] = PodVoteStrategy(votingPeriod, minQuorum);
        emit CreateVoteStrategy(podId, votingPeriod, minQuorum);

    }
}
