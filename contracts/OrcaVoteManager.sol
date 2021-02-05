pragma solidity 0.7.4;

/* solhint-disable indent */
import "./OrcaPodManager.sol";
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
    }

    address private deployer;
    OrcaPodManager private podManager;
    OrcaRulebook public rulebook;

    uint256 private proposalId = 0;
    mapping(uint256 => PodVoteStrategy) public voteStrategiesByPod;
    mapping(uint256 => PodVoteProposal) public voteProposalByPod;

    // proposalId => address => hasVoted
    mapping(uint256 => mapping(address => bool)) public userHasVotedByProposal;

    // safe variables
    address public proxyFactoryAddress = 0x76E2cFc1F5Fa8F6a5b3fC4c8F4788F0116861F9B;
    string public functionSigCreateProxy = "createProxy(address,bytes)";
    string public functionSigSetup = "setup(address[],uint256,address,bytes,address,address,uint256,address)";

    // podId => safeAddress
    mapping(uint256 => address) public safes;


    event CreateVoteStrategy(
        uint256 podId,
        uint256 votingPeriod,
        uint256 minQuorum
    );

    event CreateProposal(uint256 proposalId, uint256 podId, address proposer);

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

    event CreateSafe(
        uint256 indexed podId,
        address safeAddress
    );

    constructor(OrcaPodManager _podManager, OrcaRulebook _rulebook) public {
        deployer = msg.sender;
        rulebook = _rulebook;
        podManager = _podManager;
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

    function createSafe(uint256 _podId, address _gnosisMasterContract) internal {
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

    function createProposal(
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
                true
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

        emit CreateProposal(
            voteProposalByPod[_podId].proposalId,
            _podId,
            msg.sender
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

    function finalizeVote(uint256 _podId) public {
        PodVoteProposal storage proposal = voteProposalByPod[_podId];
        require(proposal.pending, "There is no current proposal");
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
