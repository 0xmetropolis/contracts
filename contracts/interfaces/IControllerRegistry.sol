pragma solidity 0.7.4;


interface IControllerRegistry{

    function isRegistered(address _controller) external view returns (bool);

}