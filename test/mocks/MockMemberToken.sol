pragma solidity ^0.8.7;

contract MockMemberToken {
    string public name;

    mapping(address => mapping(uint256 => uint256)) public balance;

    /**
     * @param _account The account address to assign the membership token to
     * @param _id The membership token id to mint
     * @param data Passes a flag for initial creation event
     */
    function mint(
        address _account,
        uint256 _id,
        bytes memory data
    ) external {
        require(balance[_account][_id] == 0, "Member has token already");
        balance[_account][_id] = 1;
    }

    /**
     * @param _account The account address holding the membership token to destroy
     * @param _id The id of the membership token to destroy
     */
    function burn(address _account, uint256 _id) external {
        require(balance[_account][_id] > 0, "Member has no token");
        balance[_account][_id] -= 1;
    }

    function balanceOf(address _account, uint256 _id)
        public
        view
        returns (uint256)
    {
        return balance[_account][_id];
    }

    function createPod(address[] memory, bytes memory)
        public
        pure
        returns (uint256)
    {
        return 0;
    }

    function migrateMemberController(uint256, address) public pure {
        return;
    }

    function burnSingleBatch(address[] memory, uint256) public pure {
        return;
    }
}
