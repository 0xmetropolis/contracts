pragma solidity 0.8.7;

interface IPodENSRegistrar { 

    function registerPod(bytes32 label, address podSafe) external returns (address);

    function register(bytes32 label, address owner) external;
}
