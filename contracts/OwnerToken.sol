pragma solidity 0.7.4;

/* solhint-disable indent */

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract OwnerToken is ERC721 {
    constructor() public ERC721("Orca", "ORCA") {}

    function mint(address _user, uint256 _tokenId) public {
        _mint(_user, _tokenId);
    }
}
