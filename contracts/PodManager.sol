pragma solidity 0.7.4;

import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155Receiver.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

//TODO: make this an interface
import "./MemberToken.sol";
import "./RuleManager.sol";

/* solhint-disable indent */

// This contract manages the membership rules
// it is responsible for distributing and retracting memberships

contract PodManager is ERC1155Receiver {
    MemberToken public memberToken;
    RuleManager public rulemanager;

    address public deployer;
    address public votingManager;
    mapping(uint256 => uint256) public membershipsByPod;

    event MemberTokenAddress(address contractAddress);
    event MembershipChange(uint256 podId, address from, address to);

    constructor(RuleManager _rulemanager) public {
        rulemanager = _rulemanager;
        memberToken = new MemberToken(address(this));
        emit MemberTokenAddress(address(memberToken));
        new RuleManager();
        deployer = msg.sender;
    }

    // probably a better way to manage  this
    // dependent on how we are managing contract deployment
    modifier onlyProtocol {
        require(
            // TODO: Should these be the same modifier?
            (msg.sender == deployer) || (msg.sender == votingManager),
            "Only OrcaProtocol can call this function."
        );
        _;
    }

    function setVoteManager(address _votingManager) public onlyProtocol {
        votingManager = _votingManager;
    }

    function claimMembership(uint256 _podId) public {
        require(membershipsByPod[_podId] >= 1, "No Memberships Availible");

        require(
            memberToken.balanceOf(msg.sender, _podId) == 0,
            "User is already member"
        );

        require(
            rulemanager.isRuleCompliant(_podId, msg.sender),
            "Not Rule Compliant"
        );

        memberToken.safeTransferFrom(
            address(this),
            msg.sender,
            _podId,
            1,
            bytes("")
        );
    }

    // TODO: We probably need some way for someone to give up their own token.
    // I think this is currently impossible with the way MemberToken is built

    // // add modifier for only OrcaProtocol
    function retractMembership(uint256 _podId, address _member) public {
        require(!rulemanager.isRuleCompliant(_podId, _member), "Rule Compliant");

        memberToken.safeTransferFrom(
            _member,
            address(this),
            _podId,
            1,
            "non-compliant"
        );
    }

    // Creates a pod and assigns one token to _creator
    function createPod(
        address _creator,
        uint256 _podId,
        uint256 _totalSupply
    ) public onlyProtocol {
        memberToken.createPod(_creator, _podId, _totalSupply);
    }

    function onERC1155Received(
        address _operator,
        address _from,
        uint256 _id,
        uint256 _value,
        bytes memory _data
    ) public virtual override returns (bytes4) {
        // add modifier for only MemberTokens

        membershipsByPod[_id] += _value;
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(
        address _operator,
        address _from,
        uint256[] memory _id,
        uint256[] memory _value,
        bytes memory _data
    ) public virtual override returns (bytes4) {
        // add modifier for only MemberTokens

        for (uint256 i = 0; i < _id.length; i++) {
            membershipsByPod[_id[i]] += _value[i];
        }
        return this.onERC1155BatchReceived.selector;
    }
}
