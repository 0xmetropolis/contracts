pragma solidity 0.7.4;

/* solhint-disable indent */
import "hardhat/console.sol";
import "./OrcaRulebook.sol";

contract OrcaVoteManager {
    // Vote Strategys
    struct PodVoteStrategy {
        uint256 votingPeriod; // number of blocks.
        uint256 minQuorum; // minimum number of votes needed to ratify.
    }

    // Vote Proposals
    struct PodVoteProposal {
        uint256 proposalId;
        uint256 proposalBlock; // block number of proposal
        uint256 approveVotes; // number of votes for proposal
        uint256 rejectVotes; // number of votes against proposal
        bool pending; // has the final vote been tallied
        uint256 ruleOrAction; // 0 = rule, 1 = action
    }

    // Action Proposals
    struct ActionProposal {
        address to;
        uint256 value; // block number of proposal
        bytes data; // number of votes for proposal
    }

    address private deployer;
    OrcaRulebook public rulebook;

    uint256 private proposalId = 0;
    mapping(uint256 => PodVoteStrategy) public voteStrategiesByPod;
    mapping(uint256 => PodVoteProposal) public voteProposalByPod;
    mapping(uint256 => ActionProposal) public actionProposalByPod;

    // proposalId => address => hasVoted
    mapping(uint256 => mapping(address => bool)) public userHasVotedByProposal;

    // safe variables - Orca Governance should be able to update
    address public proxyFactoryAddress =
        0x76E2cFc1F5Fa8F6a5b3fC4c8F4788F0116861F9B;
    string public functionSigCreateProxy = "createProxy(address,bytes)";
    string public functionSigSetup =
        "setup(address[],uint256,address,bytes,address,address,uint256,address)";
    string public functionSigExecTransaction =
        "execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)";

    // podId => safeAddress
    mapping(uint256 => address) public safes;

    event CreateVoteStrategy(
        uint256 podId,
        uint256 votingPeriod,
        uint256 minQuorum
    );

    event CreateRuleProposal(
        uint256 proposalId,
        uint256 podId,
        address proposer
    );

    event CreateActionProposal(
        uint256 proposalId,
        uint256 podId,
        address proposer,
        address to,
        uint256 value,
        bytes data
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
        address member,
        bool indexed yesOrNo
    );

    event CreateSafe(uint256 indexed podId, address safeAddress);

    constructor(OrcaRulebook _rulebook) public {
        deployer = msg.sender;
        rulebook = _rulebook;
    }

    // TODO: onlyProtocol
    // TODO: onlyCallOnceProtection
    function setupPodVotingAndSafe(
        uint256 _podId,
        uint256 _votingPeriod,
        uint256 _minQuorum,
        address _gnosisMasterContract
    ) public {
        createVotingStrategy(_podId, _votingPeriod, _minQuorum);
        createSafe(_podId, _gnosisMasterContract);
    }

    function createSafe(uint256 _podId, address _gnosisMasterContract)
        internal
    {
        bytes memory data = "";
        address[] memory ownerArray = new address[](1);
        ownerArray[0] = address(this);

        // encode the setup call that will be called on the new proxy safe
        // from the proxy factory
        bytes memory setupData =
            abi.encodeWithSignature(
                functionSigSetup,
                ownerArray,
                uint256(1),
                address(0),
                data,
                address(0),
                address(0),
                uint256(0),
                address(0)
            );

        bytes memory createProxyWithSetupData =
            abi.encodeWithSignature(
                functionSigCreateProxy,
                _gnosisMasterContract,
                setupData
            );
        (bool success, bytes memory result) =
            proxyFactoryAddress.call(createProxyWithSetupData);
        require(success == true, "Create Proxy With Data Failed");
        address safeAddress = bytesToAddress(result);
        safes[_podId] = safeAddress;
        emit CreateSafe(_podId, safeAddress);
    }

    function createRuleProposal(
        uint256 _podId,
        address _contractAddress,
        bytes4 _functionSignature,
        bytes32[5] memory _functionParams,
        uint256 _comparisonLogic,
        uint256 _comparisonValue
    ) public {
        // TODO: Check for Pod membership
        require(
            !voteProposalByPod[_podId].pending,
            "There is currently a proposal pending"
        );
        proposalId = proposalId + 1;
        PodVoteProposal memory currentProposal =
            PodVoteProposal(
                proposalId,
                block.number + voteStrategiesByPod[_podId].votingPeriod,
                0,
                0,
                true,
                0
            );

        voteProposalByPod[_podId] = currentProposal;

        rulebook.setPodRule(
            _podId,
            _contractAddress,
            _functionSignature,
            _functionParams,
            _comparisonLogic,
            _comparisonValue
        );

        emit CreateRuleProposal(
            voteProposalByPod[_podId].proposalId,
            _podId,
            msg.sender
        );
    }

    function createActionProposal(
        uint256 _podId,
        address _to,
        uint256 _value,
        bytes memory _data
    ) public {
        // TODO: Check for Pod membership
        require(
            !voteProposalByPod[_podId].pending,
            "There is currently a proposal pending"
        );
        proposalId = proposalId + 1;
        PodVoteProposal memory currentProposal =
            PodVoteProposal(
                proposalId,
                block.number + voteStrategiesByPod[_podId].votingPeriod,
                0,
                0,
                true,
                1
            );

        voteProposalByPod[_podId] = currentProposal;

        ActionProposal memory actionProposal =
            ActionProposal(_to, _value, _data);

        actionProposalByPod[_podId] = actionProposal;

        emit CreateActionProposal(
            voteProposalByPod[_podId].proposalId,
            _podId,
            msg.sender,
            _to,
            _value,
            _data
        );
    }

    function createVotingStrategy(
        uint256 _podId,
        uint256 _votingPeriod,
        uint256 _minQuorum
    ) public {
        // TODO: add auth protection
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

    function vote(uint256 _podId, bool _yesOrNo) public {
        // TODO: add auth (requred msg.sender is in group)
        // TODO: repeat vote protection (if membership transferred)
        PodVoteProposal storage proposal = voteProposalByPod[_podId];
        require(proposal.pending, "There is no current proposal");
        require(
            !userHasVotedByProposal[proposal.proposalId][msg.sender],
            "This member has already voted"
        );

        userHasVotedByProposal[proposal.proposalId][msg.sender] = true;
        if (_yesOrNo) {
            proposal.approveVotes = voteProposalByPod[_podId].approveVotes + 1;
        } else {
            proposal.rejectVotes = voteProposalByPod[_podId].rejectVotes + 1;
        }

        emit CastVote(_podId, proposal.proposalId, msg.sender, _yesOrNo);
    }

    function finalizeRuleVote(uint256 _podId) public {
        PodVoteProposal storage proposal = voteProposalByPod[_podId];
        require(proposal.pending, "There is no current proposal");
        require(proposal.ruleOrAction == 0, "There is not a rule proposal");
        require(
            block.number > proposal.proposalBlock,
            "The voting period has not ended"
        );

        if (
            proposal.approveVotes + proposal.rejectVotes >=
            voteStrategiesByPod[_podId].minQuorum
        ) {
            // check if enough people voted yes
            // TODO: add necessary approve votes for rule
            if (proposal.approveVotes > 0) {
                proposal.pending = false;
                rulebook.finalizePodRule(_podId);

                emit FinalizeProposal(
                    _podId,
                    proposal.proposalId,
                    msg.sender,
                    true
                );
                // reward sender
            } else {
                proposal.pending = false;

                emit FinalizeProposal(
                    _podId,
                    proposal.proposalId,
                    msg.sender,
                    false
                );
            }
        }
    }

    function finalizeActionVote(uint256 _podId) public {
        PodVoteProposal storage proposal = voteProposalByPod[_podId];
        require(proposal.pending, "There is no current proposal");
        require(proposal.ruleOrAction == 1, "There is not a rule proposal");

        require(
            block.number > proposal.proposalBlock,
            "The voting period has not ended"
        );

        if (
            proposal.approveVotes + proposal.rejectVotes >=
            voteStrategiesByPod[_podId].minQuorum
        ) {
            // check if enough people voted yes
            // TODO: add necessary approve votes for rule
            ActionProposal memory action = actionProposalByPod[_podId];
            if (proposal.approveVotes > 0) {
                proposal.pending = false;

                executeAction(
                    safes[_podId],
                    action.to,
                    action.value,
                    action.data
                );

                emit FinalizeProposal(
                    _podId,
                    proposal.proposalId,
                    msg.sender,
                    true
                );
                // reward sender
            } else {
                proposal.pending = false;

                emit FinalizeProposal(
                    _podId,
                    proposal.proposalId,
                    msg.sender,
                    false
                );
            }
        }
    }

    function executeAction(
        address _safeAddress,
        address _to,
        uint256 _value,
        bytes memory _data
    ) internal {
        uint8 operation = uint8(0);
        uint256 safeTxGas = uint256(0);
        uint256 baseGas = uint256(0);
        uint256 gasPrice = uint256(0);
        address gasToken = address(0);
        address refundReceiver = address(0);
        bytes memory signatures =
            abi.encodePacked(
                bytes32(uint256(address(this))),
                bytes32(uint256(0)),
                uint8(1)
            );

        bytes memory executeTransactionData =
            abi.encodeWithSignature(
                functionSigExecTransaction,
                _to,
                _value,
                _data,
                operation,
                safeTxGas,
                baseGas,
                gasPrice,
                gasToken,
                refundReceiver,
                signatures
            );
        (bool success, bytes memory result) =
            _safeAddress.call(executeTransactionData);
    }

    function bytesToAddress(bytes memory bys)
        public
        pure
        returns (address addr)
    {
        assembly {
            addr := mload(add(bys, 32))
        }
    }
}
