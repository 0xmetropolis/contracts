pragma solidity 0.7.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// $ORCA TOKEN

// TODO: should attach to the orca protocol to provide participation rewards

contract OrcaToken is ERC20 {
    constructor() public ERC20("Orca", "ORCA") {
        _mint(msg.sender, 1000);
    }
}
