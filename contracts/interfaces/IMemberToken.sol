pragma solidity 0.7.4;

import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

interface IMemberToken is IERC1155 {
    /**
     * @dev Total amount of tokens in with a given id.
     */
    function totalSupply(uint256 id) external view returns (uint256);

    /**
     * @dev Indicates weither any token exist with a given id, or not.
     */
    function exists(uint256 id) external view returns (bool);

    function getNextAvailablePodId() external view returns (uint256);

    /**
     * @param _podId The pod id number 
     * @param _newController The address of the new controller
     */
    function migrateMemberController(uint256 _podId, address _newController)
        external;

    /**
     * @param _account The account address to assign the membership token to
     * @param _id The membership token id to mint
     * @param data Passes a flag for initial creation event
     */
    function mint(
        address _account,
        uint256 _id,
        bytes memory data
    ) external;

    /**
     * @param _accounts The account addresses to assign the membership tokens to
     * @param _id The membership token id to mint
     * @param data Passes a flag for an initial creation event
     */
    function mintSingleBatch(
        address[] memory _accounts,
        uint256 _id,
        bytes memory data
    ) external;

    function createPod(address[] memory _accounts, bytes memory data) external returns (uint256);
}
