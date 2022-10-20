import "ens-contracts/registry/ENS.sol";
import "ens-contracts/registry/ReverseRegistrar.sol";
import "ens-contracts/resolvers/Resolver.sol";

pragma solidity ^0.8.7;

interface IPodEnsRegistrar {
    function ens() external view returns (ENS);

    function resolver() external view returns (Resolver);

    function reverseRegistrar() external view returns (ReverseRegistrar);

    function getRootNode() external view returns (bytes32);

    function registerPod(
        bytes32 label,
        address podSafe,
        address podCreator
    ) external returns (address);

    function register(bytes32 label, address owner) external;

    function setText(
        bytes32 node,
        string calldata key,
        string calldata value
    ) external;

    function setAddr(bytes32 node, address newAddress) external;

    function addressToNode(address input) external returns (bytes32);

    function getEnsNode(bytes32 label) external view returns (bytes32);
}
