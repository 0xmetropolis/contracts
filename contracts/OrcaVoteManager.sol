pragma solidity 0.7.4;

/* solhint-disable indent */
import './OrcaPodManager.sol';

contract OrcaVoteManager {
    // Vote Strategys
    struct PodVoteStrategy {
        uint256 votingPeriod; // number of blocks.
        uint256 minQuorum; // minimum number of votes needed to ratify.
    }

    // Vote Proposals
    struct PodVoteProposal {
        uint256 proposalId;
        uint256 propoalBlock; // block number of proposal

        uint256 approveVotes; // number of votes for proposal
        uint256 rejectVotes; // number of votes against proposal

        bool pending; // has the final vote been tallied

        address ruleAddress;
        uint256 ruleMinBalance;
    }

    address private deployer;
    OrcaPodManager private podManager;
    uint256 private proposalId = 0;
    mapping(uint256 => PodVoteStrategy) public voteStrategiesByPod;
    mapping(uint256 => PodVoteProposal) public voteProposalByPod;

    // proposalId => address => hasVoted
    mapping(uint256 => mapping(address => bool)) public userHasVotedByProposal;

    event CreateVoteStrategy(
        uint256 podId,
        uint256 votingPeriod,
        uint256 minQuorum
    );

    event CreateProposal(
        uint256 proposalId,
        uint256 podId,
        address ruleAddress,
        uint256 ruleMinBalance,
        address proposer
    );

    event CastVote(
        uint256 indexed podId,
        uint256 indexed proposalId,
        address indexed member,
        bool yesOrNo
    );

    constructor(OrcaPodManager _podManager) public {
        deployer = msg.sender;

        podManager = _podManager;
    }

    function createProposal (uint256 _podId, address _ruleAddress, uint256 _ruleMinBalance) public {
        // Check for Pod membership
        require(!voteProposalByPod[_podId].pending, "There is currently a proposal pending");
        proposalId = proposalId + 1;
        voteProposalByPod[_podId] = PodVoteProposal(
          proposalId,
          block.number + voteStrategiesByPod[_podId].votingPeriod,
          0,
          0,
          true,
          _ruleAddress,
          _ruleMinBalance
        );
        CreateProposal(proposalId, _podId, _ruleAddress, _ruleMinBalance, msg.sender);
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

    function vote (uint256 _podId, bool _yesOrNo) public {
        // TODO: add auth (requred msg.sender is in group)
        // TODO: repeat vote protection (if membership transferred)
        PodVoteProposal storage proposal = voteProposalByPod[_podId];
        require(proposal.pending, "There is no current proposal");
        require(!userHasVotedByProposal[proposal.proposalId][msg.sender], "This member has already voted");

        userHasVotedByProposal[proposal.proposalId][msg.sender] = true;
        if (_yesOrNo) {
          proposal.approveVotes = voteProposalByPod[_podId].approveVotes + 1;
        } else {
          proposal.rejectVotes = voteProposalByPod[_podId].rejectVotes + 1;
        }

        emit CastVote(_podId, proposal.proposalId, msg.sender, _yesOrNo);
    }

    function finalizeVote (uint256 _podId) public {
        PodVoteProposal storage proposal = voteProposalByPod[_podId];
        require(proposal.pending, "There is no current proposal");
        require(proposal.propoalBlock > block.number);

        // make sure enough people have voted
        if(proposal.approveVotes + proposal.rejectVotes > proposal.minQuorum) {
          // check if enough people vo
        }

    }
}
