pragma solidity 0.7.4;

/* solhint-disable indent */

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155Holder.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "./RuleManager.sol";

// TODO: consider  order of contract  deployment. May not want to deploy all together
// this will impact the modifiers that are important for securiy
// for not deploying supporting contracts as part of main contract

// TODO: custom implementation of erc1155
// enable defining your own podId
// enable transfer of the podId token
// only allow for one token per user

contract PowerToken is ERC1155 {
    constructor() ERC1155("POD") {}

    //TODO only power bank
    function mint(
        address _to,
        uint256 _id,
        uint256 _amount,
        bytes memory _data
    ) public {
        _mint(_to, _id, _amount, _data);
    }
}

/*
Power Bank - Keeps track of how much power a member has in a certain POD 
this power is minimally represented by a membership token
other contracts can call the Power Bank to verify a participant has
the power to perform a certain action in the context of a pod 
*/
contract PowerBank is ERC1155Holder {
    using SafeMath for uint256;
    using Address for address;

    address controller;

    PowerToken public powerToken;
    // Maps podIds to pods
    mapping(uint256 => Pod) pods;

    // TODO: Need a way to iterate through both pods and users in the pods.
    struct Pod {
        address creator;
        uint256 totalSupply;
    }

    constructor(address _powerToken) public {
        powerToken = PowerToken(_powerToken);
        // approve admin to transfer tokens on behalf of the powerbank
        powerToken.setApprovalForAll(msg.sender,true);
        controller = msg.sender;
    }

    function updateController(address _controller) public {
        require(controller == msg.sender, "!controller");
        controller = _controller;
    }

    /**
     * Creates a pod. Can only be called once.
     */
    function createPod(
        address _creator, // Gets one token
        uint256 _podId,
        uint256 _totalSupply
    ) public {
        require(controller == msg.sender, "!controller");
        // Using totalSupply to add potential for people to claim "dead" podIds.
        require(pods[_podId].totalSupply == 0, "Pod already exists");

        pods[_podId].creator = _creator;
        pods[_podId].totalSupply = _totalSupply;

        // Mint (totalSupply - 1) tokens to be owned by the PowerBank
        powerToken.mint(address(this), _podId, _totalSupply - 1, "");

        // Mint one token to the creator of the pod
        powerToken.mint(_creator, _podId, 1, "");
    }

    function claimMembership(address _user, uint256 _podId) public {
        require(controller == msg.sender, "!controller");
        require(powerToken.balanceOf(address(this), _podId) >= 1, "No Memberships Availible");

        require(
            powerToken.balanceOf(_user, _podId) == 0,
            "User is already member"
        );

        powerToken.safeTransferFrom(address(this), _user, _podId, 1, bytes(""));
    }

    function getPower(address _user, uint256 _podId)
        public
        view
        returns (uint256)
    {
        return powerToken.balanceOf(_user, _podId);
    }

    // TODO: We probably need some way for someone to give up their own token.
    // I think this is currently impossible with the way PowerBank is built
    function retractMembership(uint256 _podId, address _member) public {
        require(controller == msg.sender, "!controller");
        powerToken.safeTransferFrom(
            _member,
            address(this),
            _podId,
            1,
            "non-compliant"
        );
    }
}
