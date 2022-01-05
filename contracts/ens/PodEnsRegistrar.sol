pragma solidity 0.8.7;

import "@ensdomains/ens-contracts/contracts/registry/ENS.sol";
import "@ensdomains/ens-contracts/contracts/registry/ReverseRegistrar.sol";
import "@ensdomains/ens-contracts/contracts/resolvers/Resolver.sol";
import "../interfaces/IControllerRegistry.sol";
import "../interfaces/IInviteToken.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * A registrar that allocates subdomains to the first person to claim them.
 */
contract PodEnsRegistrar is Ownable {
    modifier onlyControllerOrOwner() {
        require(
            controllerRegistry.isRegistered(msg.sender) ||
                owner() == msg.sender,
            "sender must be controller/owner"
        );
        _;
    }

    enum State {
        onlySafeWithShip, // Only safes with SHIP token
        onlyShip, // Anyone with SHIP token
        open, // Anyone can enroll
        closed // Nobody can enroll, just in case
    }

    ENS public ens;
    Resolver public resolver;
    ReverseRegistrar public reverseRegistrar;
    IControllerRegistry controllerRegistry;
    bytes32 rootNode;
    IInviteToken inviteToken;
    State public state = State.onlySafeWithShip;

    /**
     * Constructor.
     * @param ensAddr The address of the ENS registry.
     * @param node The node that this registrar administers.
     */
    constructor(
        ENS ensAddr,
        Resolver resolverAddr,
        ReverseRegistrar _reverseRegistrar,
        IControllerRegistry controllerRegistryAddr,
        bytes32 node,
        IInviteToken inviteTokenAddr
    ) {
        ens = ensAddr;
        resolver = resolverAddr;
        controllerRegistry = controllerRegistryAddr;
        rootNode = node;
        reverseRegistrar = _reverseRegistrar;
        inviteToken = inviteTokenAddr;
    }

    function registerPod(
        bytes32 label,
        address podSafe,
        address podCreator
    ) public returns (address) {
        if (state == State.closed) {
            revert("registrations are closed");
        }

        if (state == State.onlySafeWithShip) {
            // This implicitly prevents safes that were created in this transaction
            // from registering, as they cannot have a SHIP token balance.
            require(
                inviteToken.balanceOf(podSafe) > 0,
                "safe must have SHIP token"
            );
            inviteToken.burn(podSafe, 1);
        }
        if (state == State.onlyShip) {
            // Prefer the safe's token over the user's
            if (inviteToken.balanceOf(podSafe) > 0) {
                inviteToken.burn(podSafe, 1);
            } else if (inviteToken.balanceOf(podCreator) > 0) {
                inviteToken.burn(podCreator, 1);
            } else {
                revert("sender or safe must have SHIP");
            }
        }

        bytes32 node = keccak256(abi.encodePacked(rootNode, label));

        require(
            controllerRegistry.isRegistered(msg.sender),
            "controller not registered"
        );

        require(ens.owner(node) == address(0), "label is already owned");

        _register(label, address(this));

        resolver.setAddr(node, podSafe);

        return address(reverseRegistrar);
    }

    function getRootNode() public view returns (bytes32) {
        return rootNode;
    }

    /**
     * Returns the ENS Node of a given address
     * @param input - an ENS registered address
     */
    function addressToNode(address input) public returns (bytes32) {
        return reverseRegistrar.node(input);
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
        ens.setSubnodeRecord(rootNode, label, owner, address(resolver), 0);
    }

    /**
     * @param node - the node hash of an ENS name
     */
    function setText(
        bytes32 node,
        string calldata key,
        string calldata value
    ) public onlyControllerOrOwner {
        resolver.setText(node, key, value);
    }

    function setAddr(bytes32 node, address newAddress) public onlyOwner {
        resolver.setAddr(node, newAddress);
    }

    function setRestrictionState(uint256 _state) external onlyOwner {
        state = State(_state);
    }
}
