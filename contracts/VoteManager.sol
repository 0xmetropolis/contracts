pragma solidity 0.7.4;

/* solhint-disable indent */
import "hardhat/console.sol";
import "./RuleManager.sol";

contract VoteManager {
    // Vote Strategys
    struct Strategy {
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
        bool didPass; // did the proposal pass
    }

    address private controller;

    uint256 private proposalId = 0;
    mapping(uint256 => Strategy) public voteStrategiesByPod;
    mapping(uint256 => Proposal) public proposalByPod;

    // proposalId => address => hasVoted
    mapping(uint256 => mapping(address => bool)) public userHasVotedByProposal;

    event ControllerUpdated(address newController);

    event VoteStrategyUpdated(
        uint256 indexed podId,
        uint256 minVotingPeriod, // min number of blocks for a stage.
        uint256 maxVotingPeriod, // max number of blocks for a stage.
        uint256 minQuorum, // minimum number of votes needed to ratify.
        uint256 maxQuorum // maxiimum number of votes needed to ratify.
    );

    event ProposalCreated(
        uint256 indexed proposalId,
        uint256 indexed podId,
        address indexed proposer,
        uint256 proposalType,
        uint256 executableId
    );

    event ProposalApproved(
        uint256 indexed proposalId,
        uint256 indexed podId,
        address indexed member
    );

    event ProposalPassed(uint256 indexed proposalId, uint256 indexed podId);

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
    ) public returns (bool) {
        require(controller == msg.sender, "!controller");
        emit VoteStrategyUpdated(
            _podId,
            _minVotingPeriod,
            _maxVotingPeriod,
            _minQuorum,
            _maxQuorum
        );
        // Only gets call on pod create
        voteStrategiesByPod[_podId] = Strategy(
            _minVotingPeriod,
            _maxVotingPeriod,
            _minQuorum,
            _maxQuorum
        );
        return true;
    }

    function createProposal(
        uint256 _podId,
        address _proposer,
        uint256 _proposalType,
        uint256 _executableId
    ) public returns (uint256) {
        require(controller == msg.sender, "!controller");

        Proposal memory proposal = proposalByPod[_podId];
        Strategy memory voteStrategy = voteStrategiesByPod[_podId];

        require(
            !_isProposalActive(proposal, voteStrategy),
            "There is currently a proposal pending"
        );

        proposalId += 1;

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
            approvals: 1,
            isChallenged: false,
            didPass: false
        });

        // User will automatically approve their proposal
        userHasVotedByProposal[proposalId][_proposer] = true;

        emit ProposalApproved(proposalId, _podId, _proposer);

        return proposalId;
    }

    function approveProposal(
        uint256 _proposalId,
        uint256 _podId,
        address _voter
    ) public returns (bool) {
        require(controller == msg.sender, "!controller");
        // TODO: repeat vote protection (if membership transferred)
        Proposal storage proposal = proposalByPod[_podId];
        Strategy memory voteStrategy = voteStrategiesByPod[_podId];

        require(proposal.proposalId > 0, "There is no current proposal");
        require(proposal.proposalId == _proposalId, "Invalid Proposal Id");
        require(
            !userHasVotedByProposal[proposal.proposalId][_voter],
            "This member has already voted"
        );
        require(
            _isVotingPeriodActive(proposal, voteStrategy),
            "Voting Period Not Active"
        );

        userHasVotedByProposal[proposal.proposalId][_voter] = true;
        proposal.approvals = proposalByPod[_podId].approvals + 1;

        emit ProposalApproved(proposal.proposalId, _podId, _voter);

        return true;
    }

    function passProposal(uint256 _proposalId, uint256 _podId)
        public
        returns (uint256, uint256)
    {
        require(controller == msg.sender, "!controller");

        Proposal storage proposal = proposalByPod[_podId];
        Strategy memory voteStrategy = voteStrategiesByPod[_podId];

        // TODO: proposal should pass if it reaches total supply if it's less than min quorum.
        require(
            !_isVotingPeriodActive(proposal, voteStrategy),
            "Voting Period Still Active"
        );

        require(
            _hasReachedQuorum(proposal, voteStrategy),
            "Minimum Quorum Not Reached"
        );

        proposal.didPass = true;

        emit ProposalPassed(_podId, proposal.proposalId);

        return (proposal.proposalType, proposal.executableId);
    }

    function _isVotingPeriodActive(
        Proposal memory _proposal,
        Strategy memory _voteStrategy
    ) private returns (bool) {
        // if proposal doesn't exist
        if (_proposal.proposalId == 0) return false;

        if (_proposal.isChallenged) {
            // is the blocktime within the max voting period
            return (block.number <=
                _voteStrategy.maxVotingPeriod + _proposal.proposalBlock);
        } else {
            // is the blocktime within the min voting period
            return (block.number <=
                _voteStrategy.minVotingPeriod + _proposal.proposalBlock);
        }
    }

    function _hasReachedQuorum(
        Proposal memory _proposal,
        Strategy memory _voteStrategy
    ) private returns (bool) {
        if (_proposal.isChallenged) {
            return (_proposal.approvals >= _voteStrategy.maxQuorum);
        } else {
            return (_proposal.approvals >= _voteStrategy.minQuorum);
        }
    }

    function _isProposalActive(
        Proposal memory _proposal,
        Strategy memory _voteStrategy
    ) private returns (bool) {
        // if proposal doesn't exist
        if (_proposal.proposalId == 0) return false;
        // if current proposal has been passed
        if (_proposal.didPass) return false;
        // if voting period is active, but NOT executed
        if (_isVotingPeriodActive(_proposal, _voteStrategy)) return true;
        // if quorum has been reached, but voting period is NOT over, and has NOT been executed
        if (_hasReachedQuorum(_proposal, _voteStrategy)) return true;

        return false;
    }
}
