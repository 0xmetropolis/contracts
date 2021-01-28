pragma solidity 0.7.4;

/* solhint-disable indent */

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

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

    constructor() public ERC1155("ORCA TOKENS FOOL!") {}

    // Mapping from token ID to account balances
    mapping (uint256 => mapping(address => uint256)) private _balances;

    mapping(uint256 => address) podManager;

    modifier onlyPodManager(uint256 podId) {
        require(msg.sender == podManager[podId]);
        _;
    }

    function createPod(
        address _to,
        uint256 _podId,
        uint256 _supplyTotal,
        bytes memory _data
    ) public {
        // TODO: should not allow for the same pod to mint twice
        podManager[_podId] = msg.sender;

        _mint(_to, _podId, _supplyTotal, _data);
    }

    function unsafeRevoke(uint256 _podId, address _member) public {
        address currentManager = podManager[_podId];
        require(msg.sender == currentManager);

        _balances[_podId][_member] = _balances[_podId][_member].sub(
            1,
            "ERC1155: insufficient balance for transfer"
        );

        _balances[_podId][currentManager] = _balances[_podId][currentManager].add(1);

    }

    // function safeTransferFrom(
    //     address from,
    //     address to,
    //     uint256 id,
    //     uint256 amount,
    //     bytes memory data
    // ) public override {
    //     require(to != address(0), "ERC1155: transfer to the zero address");

    //     // Allow pod creator to manage all tokens of a given pod.
    //     require(
    //         from == _msgSender() ||
    //             isApprovedForAll(from, _msgSender()) ||
    //             msg.sender == podManager[id],
    //         "ERC1155: caller is not owner nor approved"
    //     );

    //     address operator = _msgSender();

    //     _beforeTokenTransfer(
    //         operator,
    //         from,
    //         to,
    //         super._asSingletonArray(id),
    //         super._asSingletonArray(amount),
    //         data
    //     );

    //     super._balances[id][from] = super._balances[id][from].sub(
    //         amount,
    //         "ERC1155: insufficient balance for transfer"
    //     );
    //     super._balances[id][to] = super._balances[id][to].add(amount);

    //     emit TransferSingle(operator, from, to, id, amount);

    //     super._doSafeTransferAcceptanceCheck(
    //         operator,
    //         from,
    //         to,
    //         id,
    //         amount,
    //         data
    //     );
    // }	    
}
