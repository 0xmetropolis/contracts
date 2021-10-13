pragma solidity 0.8.7;

/* solhint-disable indent */

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IShipToken is IERC20 {
    function batchMint(address[] calldata accounts, uint256 amount) external;

    function mint(address account, uint256 amount) external;

    function burn(address account, uint256 amount) external;

}
