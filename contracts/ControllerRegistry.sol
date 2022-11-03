pragma solidity 0.8.7;

import "openzeppelin-contracts/access/Ownable.sol";
import "openzeppelin-contracts/utils/Address.sol";
import "./interfaces/IControllerRegistry.sol";

contract ControllerRegistry is IControllerRegistry, Ownable {
    mapping(address => bool) public controllerRegistry;

    event ControllerRegister(address newController);
    event ControllerRemove(address newController);

    /**
     * @param _controller The address to check if registered as a controller
     * @return Boolean representing if the address is a registered as a controller
     */
    function isRegistered(address _controller)
        public
        view
        override
        returns (bool)
    {
        return controllerRegistry[_controller];
    }

    /**
     * @param _controller The address to register as a controller
     */
    function registerController(address _controller) external onlyOwner {
        require(Address.isContract(_controller), "controller was not contract");
        emit ControllerRegister(_controller);
        controllerRegistry[_controller] = true;
    }

    /**
     * @param _controller The address to remove as a controller
     */
    function removeController(address _controller) external onlyOwner {
        require(isRegistered(_controller), "not registered controller");
        emit ControllerRemove(_controller);
        controllerRegistry[_controller] = false;
    }
}
