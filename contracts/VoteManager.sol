pragma solidity 0.7.4;

/* solhint-disable indent */
import "hardhat/console.sol";
import "./RuleManager.sol";

contract VoteManager {
    // Vote Strategys
    struct PodVoteStrategy {
        uint256 minVotingPeriod; // min number of blocks for a stage.
        uint256 maxVotingPeriod; // max number of blocks for a stage.
        uint256 minQuorum; // minimum number of votes needed to ratify.
        uint256 maxQuorum; // maxiimum number of votes needed to ratify.
    }

    // Proposals
    struct Proposal {
        uint256 proposalId;
        uint256 proposalType; // 0 = rule, 1 = action
        uint256 executableId; // id of the corrisponding executable in SafeTeller or RuleManager
        uint256 proposalBlock; // block number of proposal
        uint256 approvals; // number of approvals for proposal
        bool isChallenged; // has someone challenged the proposal
        bool isOpen; // has the final vote been tallied
        bool didPass; // did the proposal pass
    }

    address private controller;

    uint256 private proposalId = 0;
    mapping(uint256 => PodVoteStrategy) public voteStrategiesByPod;
    mapping(uint256 => Proposal) public proposalByPod;

    // proposalId => address => hasVoted
    mapping(uint256 => mapping(address => bool)) public userHasVotedByProposal;

    event ControllerUpdated(address newController);

    event VoteStrategyUpdated(
        uint256 podId,
        uint256 minVotingPeriod, // min number of blocks for a stage.
        uint256 maxVotingPeriod, // max number of blocks for a stage.
        uint256 minQuorum, // minimum number of votes needed to ratify.
        uint256 maxQuorum // maxiimum number of votes needed to ratify.
    );

    event ProposalCreated(
        uint256 proposalId,
        uint256 podId,
        address proposer,
        uint256 proposalType,
        uint256 executableId
    );

    event ProposalApproved(
        uint256 indexed proposalId,
        uint256 indexed podId,
        address indexed member
    );

    event ProposalFinalized(
        uint256 indexed podId,
        uint256 indexed proposalId,
        bool indexed didPass
    );

    constructor(address _controller) public {
        require(_controller == msg.sender);
        emit ControllerUpdated(_controller);
        controller = _controller;
    }

    function updateController(address _controller) public {
        require(controller == msg.sender, "!controller");
        emit ControllerUpdated(_controller);
        controller = _controller;
    }

    function createVotingStrategy(
        uint256 _podId,
        uint256 _minVotingPeriod,
        uint256 _maxVotingPeriod,
        uint256 _minQuorum,
        uint256 _maxQuorum
    ) public {
        require(controller == msg.sender, "!controller");
        emit VoteStrategyUpdated(
            _podId,
            _minVotingPeriod,
            _maxVotingPeriod,
            _minQuorum,
            _maxQuorum
        );
        // Only gets call on pod create
        voteStrategiesByPod[_podId] = PodVoteStrategy(
            _minVotingPeriod,
            _maxVotingPeriod,
            _minQuorum,
            _maxQuorum
        );
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
        emit ProposalCreated(
            proposalId,
            _podId,
            _proposer,
            _proposalType,
            _executableId
        );

        proposalByPod[_podId] = Proposal({
            proposalId: proposalId,
            proposalType: _proposalType,
            executableId: _executableId,
            proposalBlock: block.number,
            approvals: 0,
            isChallenged: false,
            isOpen: true,
            didPass: false
        });

        proposalId += 1;
    }

    function approveProposal(
        uint256 _podId,
        uint256 _proposalId,
        address _voter
    ) public {
        require(controller == msg.sender, "!controller");
        // TODO: repeat vote protection (if membership transferred)
        Proposal storage proposal = proposalByPod[_podId];
        require(proposal.isOpen, "There is no current proposal");
        require(
            !userHasVotedByProposal[proposal.proposalId][_voter],
            "This member has already voted"
        );
        require(proposal.proposalId == _proposalId, "Invalid Proposal Id");

        userHasVotedByProposal[proposal.proposalId][_voter] = true;
        proposal.approvals = proposalByPod[_podId].approvals + 1;

        emit ProposalApproved(proposal.proposalId, _podId, _voter);
    }

    function finalizeProposal(uint256 _podId, uint256 _proposalId)
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
            block.number >
                proposal.proposalBlock + voteStrategy.minVotingPeriod,
            "The voting period has not ended"
        );

        // TODO: proposal should pass if it reaches total supply if it's less than min quorum.
        require(
            proposal.approvals >= voteStrategy.minQuorum,
            "Minimum Quorum Not Reached"
        );

        proposal.didPass = true;
        proposal.isOpen = false;

        emit ProposalFinalized(_podId, proposal.proposalId, proposal.didPass);

        return (true, proposal.proposalType, proposal.executableId);
    }
}
