pragma solidity 0.7.4;

/* solhint-disable indent */

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

// TODO: consider  order of contract  deployment. May not want to deploy all together
// this will impact the modifiers that are important for securiy
// for not deploying supporting contracts as part of main contract

// TODO: custom implementation of erc1155
// enable defining your own podId
// enable transfer of the podId token
// only allow for one token per user

contract OrcaMemberToken is ERC1155 {
    constructor() public ERC1155("ORCA TOKENS FOOL!") {}

    // podCreator should be the OrcaPodManager
    mapping(uint256 => address) podCreator;

    modifier onlyPodCreator(uint256 podId) {
        require(msg.sender == podCreator[podId]);
        _;
    }

    function createPod(
        address to,
        uint256 podId,
        uint256 supplyTotal,
        bytes memory data
    ) public {
        podCreator[podId] = msg.sender;

        _mint(to, podId, supplyTotal, data);
    }

    function safeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) public override {
        require(to != address(0), "ERC1155: transfer to the zero address");

        // Allow pod creator to manage all tokens of a given pod.
        require(
            from == _msgSender() ||
                isApprovedForAll(from, _msgSender()) ||
                msg.sender == podCreator[id],
            "ERC1155: caller is not owner nor approved"
        );

        address operator = _msgSender();

        _beforeTokenTransfer(
            operator,
            from,
            to,
            super._asSingletonArray(id),
            super._asSingletonArray(amount),
            data
        );

        super._balances[id][from] = super._balances[id][from].sub(
            amount,
            "ERC1155: insufficient balance for transfer"
        );
        super._balances[id][to] = super._balances[id][to].add(amount);

        emit TransferSingle(operator, from, to, id, amount);

        super._doSafeTransferAcceptanceCheck(
            operator,
            from,
            to,
            id,
            amount,
            data
        );
    }
}
