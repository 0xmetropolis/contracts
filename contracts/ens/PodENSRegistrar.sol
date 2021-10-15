pragma solidity 0.8.7;

import "@ensdomains/ens-contracts/contracts/registry/ENS.sol";
import "@ensdomains/ens-contracts/contracts/resolvers/Resolver.sol";
import "../interfaces/IControllerRegistry.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * A registrar that allocates subdomains to the first person to claim them.
 */
contract PodEnsRegistrar is Ownable {
    ENS ens;
    Resolver resolver;
    address reverseRegistrar;
    IControllerRegistry controllerRegistry;
    bytes32 rootNode;

    //TODO: add whitelist    

    /**
     * Constructor.
     * @param ensAddr The address of the ENS registry.
     * @param node The node that this registrar administers.
     */
    constructor(ENS ensAddr, Resolver resolverAddr, address _reverseRegistrar, IControllerRegistry controllerRegistryAddr, bytes32 node) {
        ens = ensAddr;
        resolver = resolverAddr;
        controllerRegistry = controllerRegistryAddr;
        rootNode = node;
        reverseRegistrar = _reverseRegistrar;
    }

    function registerPod(bytes32 label, address podSafe) public returns(address) {

        bytes32 node = keccak256(abi.encodePacked(rootNode, label));

        require(controllerRegistry.isRegistered(msg.sender), "controller not registered");

        require(
            ens.owner(node) == address(0),
            "label is already owned"
        );
        
        _register(label, address(this));

        resolver.setAddr(node, podSafe);

        return address(reverseRegistrar);
    }


    /**
     * Register a name, or change the owner of an existing registration.
     * @param label The hash of the label to register.
     */
    function register(bytes32 label, address owner) public onlyOwner {
        _register(label, owner);
    }

    /**
     * Register a name, or change the owner of an existing registration.
     * @param label The hash of the label to register.
     */
    function _register(bytes32 label, address owner) internal {

        ens.setSubnodeRecord(
            rootNode,
            label,
            owner,
            address(resolver),
            0
        );

    }

    function setText(bytes32 node, string calldata key, string calldata value) public onlyOwner {
        resolver.setText(node, key, value);
    }

    function setAddr(bytes32 node, address newAddress) public onlyOwner {
        resolver.setAddr(node, newAddress);
    }
}
