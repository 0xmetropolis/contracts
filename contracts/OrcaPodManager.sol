pragma solidity 0.7.4;

import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155Receiver.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

//TODO: make this an interface
import "./OrcaMemberToken.sol";

// This contract manages the membership rules
// it is responsible for distributing and retracting memberships

contract OrcaPodManager is ERC1155Receiver {

    // Rules
    struct Rule {
        address contractAddress;
        bytes4 functionSignature;
        bytes32[5] functionParams;
        uint256 comparisonLogic;
        uint256 comparisonValue;
    }

    OrcaMemberToken memberToken;
    address public deployer;
    address public votingManager;
    mapping(uint256 => Rule) public rulesByPod;
    mapping(uint256 => uint256) public membershipsByPod;

    event MembershipChange(uint256 podId, address from, address to);

    event CreateRule(
        uint256 podId,
        address contractAddress,
        bytes4 functionSignature,
        bytes32[5] functionParams,
        uint256 comparisonLogic,
        uint256 comparisonValue
    );

    event UpdateRule(
        uint256 podId,
        address contractAddress,
        bytes4 functionSignature,
        bytes32[5] functionParams,
        uint256 comparisonLogic,
        uint256 comparisonValue
    );


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

    modifier onlyVotingManager {
        require(
            msg.sender == votingManager,
            "Only VotingManager can call this function."
        );
        _;
    }


    function setVoteManager(address _votingManager) public onlyProtocol {
        votingManager = _votingManager;
    }

    function claimMembership(uint256 _podId) public {
        require(membershipsByPod[_podId] >= 1, "No Memberships Availible");

        Rule memory currentRule = rulesByPod[_podId];

        // check function params for keywords
        for (uint i = 0; i < currentRule.functionParams.length; i++) {
            if ( currentRule.functionParams[i] == bytes32("msg.sender") ){
                currentRule.functionParams[i] =  bytes32(uint256(msg.sender));
            }
        }

        (bool success, bytes memory result) = currentRule.contractAddress.call(abi.encodePacked(currentRule.functionSignature, currentRule.functionParams[0], currentRule.functionParams[1], currentRule.functionParams[2], currentRule.functionParams[3], currentRule.functionParams[4]));
        require(success == true, "Claim Transaction Failed");

        if(currentRule.comparisonLogic == 0){
          require(toUint256(result) == currentRule.comparisonValue , "Claim Rule Failed");
        }
        if(currentRule.comparisonLogic == 1){
          require(toUint256(result) > currentRule.comparisonValue , "Claim Rule Failed");
        }
        if(currentRule.comparisonLogic == 2){
          require(toUint256(result) < currentRule.comparisonValue , "Claim Rule Failed");
        }

        memberToken.safeTransferFrom(
            address(this),
            msg.sender,
            _podId,
            1,
            bytes("")
        );
    }

    // // add modifier for only OrcaProtocol
    // function retractMembership(){}

    function createPodRule(
        uint256 _podId,
        address _contractAddress,
        bytes4 _functionSignature,
        bytes32[5] memory _functionParams,
        uint256 _comparisonLogic,
        uint256 _comparisonValue
    ) public onlyProtocol {
        rulesByPod[_podId] = Rule(_contractAddress, _functionSignature, _functionParams, _comparisonLogic, _comparisonValue);
        emit CreateRule(
          _podId,
          rulesByPod[_podId].contractAddress,
          rulesByPod[_podId].functionSignature,
          rulesByPod[_podId].functionParams,
          rulesByPod[_podId].comparisonLogic,
          rulesByPod[_podId].comparisonValue
        );
    }

    function setPodRule(
        uint256 _podId,
        address _contractAddress,
        bytes4 _functionSignature,
        bytes32[5] memory _functionParams,
        uint256 _comparisonLogic,
        uint256 _comparisonValue
    ) public onlyVotingManager {
        rulesByPod[_podId] = Rule(_contractAddress, _functionSignature, _functionParams, _comparisonLogic, _comparisonValue);
        emit UpdateRule(
          _podId,
          rulesByPod[_podId].contractAddress,
          rulesByPod[_podId].functionSignature,
          rulesByPod[_podId].functionParams,
          rulesByPod[_podId].comparisonLogic,
          rulesByPod[_podId].comparisonValue
        );
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

        for (uint256 i = 0; i < _id.length; i++) {
            membershipsByPod[_id[i]] += _value[i];
        }
        return this.onERC1155BatchReceived.selector;
    }

    function toUint256(bytes memory _bytes) internal pure returns (uint256 value) {
        assembly {
            value := mload(add(_bytes, 0x20))
        }
    }
}
