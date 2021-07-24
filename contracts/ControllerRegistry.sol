pragma solidity 0.7.4;

import "@openzeppelin/contracts/access/Ownable.sol";

contract ControllerRegistry is Ownable {
    mapping(address => bool) public controllerRegistry;

    event ControllerRegister(address newController);
    event ControllerRemove(address newController);

    constructor() {}

    function registerController(address _controller) public onlyOwner {
        emit ControllerRegister(_controller);
        controllerRegistry[_controller] = true;
    }

    function removeController(address _controller) public onlyOwner {
        emit ControllerRemove(_controller);
        controllerRegistry[_controller] = false;
    }

    function isRegistered(address _controller) public view returns (bool) {
        return controllerRegistry[_controller];
    }
}
