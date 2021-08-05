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

    function migrateMemberController(uint256 _podId, address _newController)
        external;

    function mint(
        address _account,
        uint256 _id,
        bytes memory data
    ) external;

    function mintSingleBatch(
        address[] memory _accounts,
        uint256 _id,
        bytes memory data
    ) external;

    function createPod(address[] memory _accounts, bytes memory data) external returns (uint256);
}
