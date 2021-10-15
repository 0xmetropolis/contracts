pragma solidity 0.8.7;

interface IPodEnsRegistrar { 

    function registerPod(bytes32 label, address podSafe, address podCreator) external returns (address);

    function register(bytes32 label, address owner) external;
}
