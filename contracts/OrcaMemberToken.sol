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

    function mint(
        uint256 id,
        uint256 supplyTotal,
        bytes memory data
    ) public {
        _mint(msg.sender, id, supplyTotal, data);
    }
}
