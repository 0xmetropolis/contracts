pragma solidity 0.7.4;

/* solhint-disable indent */

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "./OrcaPodManager.sol";

// TODO: consider  order of contract  deployment. May not want to deploy all together
// this will impact the modifiers that are important for securiy
// for not deploying supporting contracts as part of main contract

// TODO: custom implementation of erc1155
// enable defining your own podId
// enable transfer of the podId token
// only allow for one token per user

contract OrcaMemberToken is ERC1155 {
    using SafeMath for uint256;
    using Address for address;

    address podManager;

    struct Pod {
        address creator;
        uint256 totalSupply;
    }

    // Maps podIds to pods
    mapping(uint256 => Pod) pods;

    constructor(address _podManager) public ERC1155("ORCA TOKENS FOOL!") {
        podManager = _podManager;
    }

    /**
     * Prevent anyone who is not the podManager from interacting with these tokens.
     */
    function _beforeTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal virtual override {
        if (msg.sender != podManager) {
            require(isApprovedForAll(from, podManager), "OrcaPodManager must be approved for this account");
        }

        require(msg.sender == podManager, "Only OrcaPodManager can interact with these tokens");
    }

    /**
     * Creates a pod. Can only be called once.
     */
    function createPod(
        address _creator, // Gets one token
        uint256 _podId,
        uint256 _totalSupply
    ) public {
        // Using totalSupply to add potential for people to claim "dead" podIds.
        require(pods[_podId].totalSupply == 0, "Pod already exists");

        pods[_podId].creator = _creator;
        pods[_podId].totalSupply = _totalSupply;

        // Mint (totalSupply - 1) tokens to be owned by the PodManager
        _mint(msg.sender, _podId, _totalSupply - 1, "");

        // Mint one token to the creator of the pod
        _mint(msg.sender, _podId, 1, "");
    }
}
