pragma solidity 0.7.4;

/* solhint-disable indent */
import './OrcaPodManager.sol';

contract OrcaVoteManager {
    address deployer;
    OrcaPodManager podManager;

    // Vote Strategys
    struct PodVoteStrategy {
        uint256 votingPeriod; // number of blocks.
        uint256 minQuorum; // minimum number of votes needed to ratify.
    }

    mapping(uint256 => PodVoteStrategy) public voteStrategiesByPod;

    event CreateVoteStrategy(
        uint256 podId,
        uint256 votingPeriod,
        uint256 minQuorum
    );

    // Vote Proposals
    struct PodVoteProposal {
        uint256 propoalBlock; // block number of proposal

        uint256 approveVotes; // number of votes for proposal
        uint256 rejectVotes; // number of votes against proposal
        
        bool pending; // has the final vote been tallied

        address ruleAddress;
        uint256 ruleMinBalance;
    }

    mapping(uint256 => PodVoteProposal) public voteProposalByPod;

    event CreateProposal(
        uint256 podId,
        address ruleAddress,
        uint256 ruleMinBalance,
        address proposer
    );

    mapping(uint256 => address[]) public userHasVoteByPod;

    constructor(OrcaPodManager _podManager) public {
        deployer = msg.sender;
        podManager = _podManager;
    }

    function createProposal (uint256 _podId, address _ruleAddress, uint256 _ruleMinBalance) public {
        // Check for Pod membership
        require(!voteProposalByPod[_podId].pending, "There is currently a proposal pending");
        voteProposalByPod[_podId] = PodVoteProposal(block.number,0,0,true,_ruleAddress,_ruleMinBalance );
        CreateProposal(_podId, _ruleAddress, _ruleMinBalance, msg.sender);
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
