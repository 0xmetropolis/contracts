pragma solidity 0.8.7;

/* solhint-disable indent */

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import "./interfaces/IControllerRegistry.sol";
import "./interfaces/IController.sol";

string constant beforeTokenTransferSig = "beforeTokenTransfer(address,address,address,uint256[],uint256[],bytes)";

contract MemberToken is ERC1155Supply {
    using Address for address;

    IControllerRegistry public controllerRegistry;

    mapping(uint256 => address) public memberController;

    uint8 internal constant CREATE_EVENT = 0x01;
    uint256 public nextAvailablePodId = 0;

    event MigrateMemberController(uint256 podId, address newController);

    /**
     * @param _controllerRegistry The address of the ControllerRegistry contract
     */
    constructor(address _controllerRegistry) ERC1155("POD") {
        require(_controllerRegistry != address(0), "Invalid address");
        controllerRegistry = IControllerRegistry(_controllerRegistry);
    }

    /**
     * @param _podId The pod id number
     * @param _newController The address of the new controller
     */
    function migrateMemberController(uint256 _podId, address _newController)
        external
    {
        require(_newController != address(0), "Invalid address");
        require(
            msg.sender == memberController[_podId],
            "Invalid migrate controller"
        );
        require(
            controllerRegistry.isRegistered(_newController),
            "Controller not registered"
        );

        memberController[_podId] = _newController;
        emit MigrateMemberController(_podId, _newController);
    }

    function getNextAvailablePodId() external view returns (uint256) {
        return nextAvailablePodId;
    }

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
        require(_account != address(0), "Invalid address");
        _mint(_account, _id, 1, data);
    }

    /**
     * @param _accounts The account addresses to assign the membership tokens to
     * @param _id The membership token id to mint
     * @param data Passes a flag for an initial creation event
     */
    function mintSingleBatch(
        address[] memory _accounts,
        uint256 _id,
        bytes memory data
    ) public {
        for (uint256 index = 0; index < _accounts.length; index += 1) {
            require(_accounts[index] != address(0), "Invalid address");
            _mint(_accounts[index], _id, 1, data);
        }
    }

    function createPod(address[] memory _accounts, bytes memory data)
        external
        returns (uint256)
    {
        uint256 id = nextAvailablePodId;
        nextAvailablePodId += 1;

        require(
            controllerRegistry.isRegistered(msg.sender),
            "Controller not registered"
        );

        memberController[id] = msg.sender;

        if (_accounts.length != 0) {
            // Can't call mintSingleBatch because of its require
            for (uint256 index = 0; index < _accounts.length; index += 1) {
                _mint(_accounts[index], id, 1, data);
            }
        }

        return id;
    }

    /**
     * @param _account The account address holding the membership token to destroy
     * @param _id The id of the membership token to destroy
     */
    function burn(address _account, uint256 _id) external {
        require(balanceOf(_account, _id) >= 1, "User is not a member");
        _burn(_account, _id, 1);
    }

    // this hook gets called before every token event including mint and burn
    /**
     * @param operator The account address that initiated the action
     * @param from The account address recieveing the membership token
     * @param to The account address sending the membership token
     * @param ids An array of membership token ids to be transfered
     * @param amounts The amount of each membership token type to transfer
     * @param data Passes a flag for an initial creation event
     */
    function _beforeTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal override {
        // use first id to lookup controller
        address controller = memberController[ids[0]];
        require(controller != address(0), "Pod doesn't exist");

        for (uint256 i = 0; i < ids.length; i += 1) {
            // check if recipient is already member
            if (to != address(0)) {
                require(balanceOf(to, ids[i]) == 0, "User is already member");
            }
            // verify all ids use same controller
            require(
                memberController[ids[i]] == controller,
                "Ids have different controllers"
            );
        }

        // perform orca token transfer validations
        controller.functionCall(
            abi.encodeWithSignature(
                beforeTokenTransferSig,
                operator,
                from,
                to,
                ids,
                amounts,
                data
            )
        );
    }
}
