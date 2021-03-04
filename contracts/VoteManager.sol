pragma solidity 0.7.4;

/* solhint-disable indent */
import "hardhat/console.sol";
import "./RuleManager.sol";

contract VoteManager {
    // Vote Strategys
    struct PodVoteStrategy {
        uint256 votingPeriod; // number of blocks.
        uint256 minQuorum; // minimum number of votes needed to ratify.
    }

    // Proposals
    struct Proposal {
        uint256 proposalId;
        uint256 proposalBlock; // block number of proposal
        uint256 approveVotes; // number of votes for proposal
        uint256 rejectVotes; // number of votes against proposal
        bool isOpen; // has the final vote been tallied
        uint256 proposalType; // 0 = rule, 1 = action
        uint256 executableId; // id of the corrisponding executable in SafeTeller or RuleManager
        bool didPass; // did the proposal pass
    }

    address private controller;

    uint256 private proposalId = 0;
    mapping(uint256 => PodVoteStrategy) public voteStrategiesByPod;
    mapping(uint256 => Proposal) public proposalByPod;

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
        address proposer,
        uint256 proposalType,
        uint256 executableId
    );

    event CastVote(
        uint256 indexed podId,
        uint256 indexed proposalId,
        address indexed member,
        bool yesOrNo
    );

    event FinalizeProposal(
        uint256 indexed podId,
        uint256 indexed proposalId,
        bool indexed didPass
    );

    constructor() public {
        controller = msg.sender;
    }

    function updateController(address _controller) public {
        require(controller == msg.sender, "!controller");
        controller = _controller;
    }

    function createProposal(
        uint256 _podId,
        address _proposer,
        uint256 _proposalType,
        uint256 _executableId
    ) public {
        require(controller == msg.sender, "!controller");
        require(
            !proposalByPod[_podId].isOpen,
            "There is currently a proposal pending"
        );
        proposalId += 1;

        proposalByPod[_podId] = Proposal({
            proposalId: proposalId,
            proposalBlock: block.number,
            approveVotes: 0,
            rejectVotes: 0,
            isOpen: true,
            proposalType: _proposalType,
            executableId: _executableId,
            didPass: false
        });

        emit CreateProposal(
            proposalId,
            _podId,
            _proposer,
            _proposalType,
            _executableId
        );
    }

    function createVotingStrategy(
        uint256 _podId,
        uint256 _votingPeriod,
        uint256 _minQuorum
    ) public {
        require(controller == msg.sender, "!controller");
        // Only gets call on pod create
        voteStrategiesByPod[_podId] = PodVoteStrategy(
            _votingPeriod,
            _minQuorum
        );
        emit CreateVoteStrategy(
            _podId,
            voteStrategiesByPod[_podId].votingPeriod,
            voteStrategiesByPod[_podId].minQuorum
        );
    }

    function vote(uint256 _podId, bool _yesOrNo, address voter) public {
        require(controller == msg.sender, "!controller");
        // TODO: repeat vote protection (if membership transferred)
        Proposal storage proposal = proposalByPod[_podId];
        require(proposal.isOpen, "There is no current proposal");
        require(
            !userHasVotedByProposal[proposal.proposalId][voter],
            "This member has already voted"
        );

        userHasVotedByProposal[proposal.proposalId][voter] = true;
        if (_yesOrNo) {
            proposal.approveVotes = proposalByPod[_podId].approveVotes + 1;
        } else {
            proposal.rejectVotes = proposalByPod[_podId].rejectVotes + 1;
        }

        emit CastVote(_podId, proposal.proposalId, voter, _yesOrNo);
    }

    function finalizeProposal(uint256 _podId)
        public
        returns (
            bool,
            uint256,
            uint256
        )
    {
        require(controller == msg.sender, "!controller");
        
        Proposal storage proposal = proposalByPod[_podId];
        require(proposal.isOpen, "There is no current proposal");

        PodVoteStrategy memory voteStrategy = voteStrategiesByPod[_podId];
        require(
            block.number > proposal.proposalBlock + voteStrategy.votingPeriod,
            "The voting period has not ended"
        );

        // TODO: allow finalize if voting period has ended
        require(
            proposal.approveVotes + proposal.rejectVotes >=
                voteStrategy.minQuorum,
            "Minimum Quorum Not Reached"
        );

        // TODO: safe math
        proposal.didPass = proposal.approveVotes > voteStrategy.minQuorum / 2;
        proposal.isOpen = false;

        emit FinalizeProposal(_podId, proposal.proposalId, proposal.didPass);

        return (proposal.didPass, proposal.proposalType, proposal.executableId);
    }
}
