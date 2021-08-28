pragma solidity 0.7.4;

interface ISafeTeller {

    /**
     * @param _controller The address to set as controller
     */
    function updateController(address _controller) external;

    /**
     * @param safe The address of the safe
     * @param _newSafeTeller The address of the new safe teller contract
     */
    function migrateSafeTeller(address safe, address _newSafeTeller) external;

    function getMembers(address safe) external returns (address[] memory);

    function isModuleEnabled(address safe) external view returns (bool);

    function isMember(address safe, address member) external view returns (bool);

    /**
     * @param _podId The id number of the pod
     * @param _owners The  addresses to be owners of the safe
     * @param _threshold The number of owners that are required to sign a transaciton
     * @return safeAddress The address of the new safe
     */
    function createSafe(
        uint256 _podId,
        address[] memory _owners,
        uint256 _threshold
    ) external returns (address safeAddress);

    /**
     * @param to The account address to add as an owner
     * @param safe The address of the safe
     */
    function onMint(address to, address safe) external;

    /**
     * @param from The address to be removed as an owner
     * @param safe The address of the safe
     */
    function onBurn(address from, address safe) external;

    /**
     * @param from The address being removed as an owner
     * @param to The address being added as an owner
     * @param safe The address of the safe
     */
    function onTransfer(
        address from,
        address to,
        address safe
    ) external;

    // Used in a delegate call to enable module add on setup
    function enableModule(address module) external;

    function delegateSetup(address _context) external;
}
