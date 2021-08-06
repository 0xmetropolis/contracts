pragma solidity 0.7.4;


interface IControllerRegistry{

    /**
     * @param _controller The account address to check if registered as a controller
     * @return Boolean representing if the address is a registered as a controller
     */
    function isRegistered(address _controller) external view returns (bool);

}
