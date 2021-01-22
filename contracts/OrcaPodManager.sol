pragma solidity 0.7.4;

import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155Receiver.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

//TODO: make this an interface
import "./OrcaMemberToken.sol";

// This contract manages the membership rules
// it is responsible for distributing and retracting memberships

contract OrcaPodManager is ERC1155Receiver {
    OrcaMemberToken memberToken;
    address deployer;

    // Rules
    struct Rule {
        address contractAddress;
        uint256 minBalance;
    }

    mapping(uint256 => Rule) public rulesByPod;

    event CreateRule(uint256 podId, address contractAddress, uint256 minBalance);

    
    // Memberships
    mapping(uint256 => uint256) public membershipsByPod;

    event MembershipChange(uint256 podId, address from, address to);

    constructor(OrcaMemberToken _memberToken) public {
        memberToken = _memberToken;
        deployer = msg.sender;
    }

    // probably a better way to manage  this
    // dependent on how we are managing contract deployment
    modifier onlyProtocol {
        require(
            msg.sender == deployer,
            "Only OrcaProtocol can call this function."
        );
        _;
    }

    function claimMembership(uint256 podId) public {
        require(membershipsByPod[podId] >= 1, "No Memberships Availible");
        
        Rule memory currentRule = rulesByPod[podId];
        
        require(IERC20(currentRule.contractAddress).balanceOf(msg.sender) >= currentRule.minBalance, "Not Enough Tokens");

        memberToken.safeTransferFrom(address(this), msg.sender, podId, 1, bytes(""));
    }

    // // add modifier for only OrcaProtocol
    // function retractMembership(){}

    // add modifier for only OrcaProtocol
    function createPodRule(
        uint256 podId,
        address contractAddress,
        uint256 minBalance
    ) public {
        rulesByPod[podId] = Rule(contractAddress, minBalance);
        emit CreateRule(podId, contractAddress, minBalance);
    }

    function onERC1155Received(
        address _operator,
        address _from,
        uint256 _id,
        uint256 _value,
        bytes memory _data
    ) public virtual override returns (bytes4) {
        // add modifier for only OrcaMemberTokens

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
        // add modifier for only OrcaMemberTokens

        for (uint i = 0; i < _id.length; i++) {
            membershipsByPod[_id[i]] += _value[i];
        }
        return this.onERC1155BatchReceived.selector;
    }

}
