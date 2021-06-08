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
        //TODO: excutable hash would allow re-use
        uint256 executableId; // id of the corrisponding executable in SafeTeller or RuleManager
        uint256 proposalTime; // timestamp of proposal
        uint256 approvals; // number of approvals for proposal
        bool isChallenged; // has someone challenged the proposal
        bool didPass; // did the proposal pass
    }

    enum ProposalState {Active, Failed, Succeeded, Passed}

    address private controller;

    uint256 private proposalId = 0;
    mapping(uint256 => Strategy) public voteStrategiesByPod;
    mapping(uint256 => Proposal) public proposalByPod;

    // only used for as a strategy update buffer
    uint256 private strategyId = 0;
    mapping(uint256 => Strategy) public strategyById;

    // proposalId => address => hasVoted
    mapping(uint256 => mapping(address => bool)) public userHasVotedByProposal;

    event ControllerUpdated(address newController);

    event VoteStrategyCreated(
        uint256 strategyId,
        uint256 minVotingPeriod, // min number of blocks for a stage.
        uint256 maxVotingPeriod, // max number of blocks for a stage.
        uint256 minQuorum, // minimum number of votes needed to ratify.
        uint256 maxQuorum // maxiimum number of votes needed to ratify.
    );

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

    event ProposalChallenged(
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
        uint256 _minVotingPeriod,
        uint256 _maxVotingPeriod,
        uint256 _minQuorum,
        uint256 _maxQuorum
    ) public returns (uint256) {
        require(controller == msg.sender, "!controller");

        strategyId += 1;

        emit VoteStrategyCreated(
            strategyId,
            _minVotingPeriod,
            _maxVotingPeriod,
            _minQuorum,
            _maxQuorum
        );

        strategyById[strategyId] = Strategy(
            _minVotingPeriod,
            _maxVotingPeriod,
            _minQuorum,
            _maxQuorum
        );

        return strategyId;
    }

    function finalizeVotingStrategy(uint256 _podId, uint256 _strategyId)
        public
        returns (bool)
    {
        require(controller == msg.sender, "!controller");

        Strategy memory voteStrategy = strategyById[_strategyId];

        emit VoteStrategyUpdated(
            _podId,
            voteStrategy.minVotingPeriod,
            voteStrategy.maxVotingPeriod,
            voteStrategy.minQuorum,
            voteStrategy.maxQuorum
        );

        voteStrategiesByPod[_podId] = voteStrategy;
        return true;
    }

    function createProposal(
        uint256 _podId,
        address _proposer,
        uint256 _proposalType,
        uint256 _executableId
    ) public returns (uint256) {
        require(controller == msg.sender, "!controller");

        ProposalState currentState = state(_podId);
        require(
            currentState != ProposalState.Active,
            "There is currently a proposal pending"
        );
        require(
            currentState != ProposalState.Succeeded,
            "There is currently a proposal pending"
        );

        Proposal memory proposal = proposalByPod[_podId];

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
            proposalTime: block.timestamp,
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
        address _account
    ) public returns (bool) {
        require(controller == msg.sender, "!controller");
        // TODO: repeat vote protection (if membership transferred)
        require(
            state(_podId) == ProposalState.Active,
            "Voting Period Not Active"
        );

        Proposal storage proposal = proposalByPod[_podId];

        require(
            !userHasVotedByProposal[proposal.proposalId][_account],
            "This member has already voted"
        );

        userHasVotedByProposal[proposal.proposalId][_account] = true;
        proposal.approvals += 1;

        emit ProposalApproved(proposal.proposalId, _podId, _account);

        return true;
    }

    function passProposal(uint256 _proposalId, uint256 _podId)
        public
        returns (uint256, uint256)
    {
        require(controller == msg.sender, "!controller");
        require(
            state(_podId) == ProposalState.Succeeded,
            "Proposal Not Succeeded"
        );

        Proposal storage proposal = proposalByPod[_podId];
        proposal.didPass = true;

        emit ProposalPassed(_podId, proposal.proposalId);

        return (proposal.proposalType, proposal.executableId);
    }

    function challengeProposal(
        uint256 _proposalId,
        uint256 _podId,
        address _account
    ) public returns (bool) {
        require(controller == msg.sender, "!controller");
        require(state(_podId) == ProposalState.Active, "Proposal Not Active");

        Proposal storage proposal = proposalByPod[_podId];
        proposal.isChallenged = true;

        emit ProposalChallenged(proposal.proposalId, _podId, _account);

        return true;
    }

    function state(uint256 _podId) public view returns (ProposalState) {
        Proposal memory proposal = proposalByPod[_podId];
        Strategy memory strategy = voteStrategiesByPod[_podId];

        if (proposal.proposalId == 0) {
            return ProposalState.Failed;
        } else if (proposal.didPass) {
            return ProposalState.Passed;
        } else if (
            block.timestamp <
            proposal.proposalTime +
                (
                    proposal.isChallenged
                        ? strategy.maxVotingPeriod
                        : strategy.minVotingPeriod
                )
        ) {
            return ProposalState.Active;
        } else if (
            proposal.approvals >=
            (proposal.isChallenged ? strategy.maxQuorum : strategy.minQuorum)
        ) {
            return ProposalState.Succeeded;
        } else {
            return ProposalState.Failed;
        }
    }
}
