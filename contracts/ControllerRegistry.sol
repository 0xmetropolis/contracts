pragma solidity 0.7.4;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IControllerRegistry.sol";

contract ControllerRegistry is IControllerRegistry, Ownable {
    mapping(address => bool) public controllerRegistry;

    event ControllerRegister(address newController);
    event ControllerRemove(address newController);

    constructor() {}

    function registerController(address _controller) external onlyOwner {
        emit ControllerRegister(_controller);
        controllerRegistry[_controller] = true;
    }

    function removeController(address _controller) external onlyOwner {
        emit ControllerRemove(_controller);
        controllerRegistry[_controller] = false;
    }

    function isRegistered(address _controller)
        external
        view
        override
        returns (bool)
    {
        return controllerRegistry[_controller];
    }
}