pragma solidity 0.7.4;

/* solhint-disable indent */

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./interfaces/IControllerRegistry.sol";
import "./interfaces/IController.sol";

string constant beforeTokenTransferSig = "beforeTokenTransfer(address,address,address,uint256[],uint256[],bytes)";

abstract contract ERC1155Supply is ERC1155 {
    mapping(uint256 => uint256) private _totalSupply;

    /**
     * @dev Total amount of tokens in with a given id.
     */
    function totalSupply(uint256 id) public view virtual returns (uint256) {
        return _totalSupply[id];
    }

    /**
     * @dev Indicates weither any token exist with a given id, or not.
     */
    function exists(uint256 id) public view virtual returns (bool) {
        return ERC1155Supply.totalSupply(id) > 0;
    }

    /**
     * @dev See {ERC1155-_mint}.
     */
    function _mint(
        address account,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) internal virtual override {
        super._mint(account, id, amount, data);
        _totalSupply[id] += amount;
    }

    /**
     * @dev See {ERC1155-_mintBatch}.
     */
    function _mintBatch(
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal virtual override {
        super._mintBatch(to, ids, amounts, data);
        for (uint256 i = 0; i < ids.length; ++i) {
            _totalSupply[ids[i]] += amounts[i];
        }
    }

    /**
     * @dev See {ERC1155-_burn}.
     */
    function _burn(
        address account,
        uint256 id,
        uint256 amount
    ) internal virtual override {
        super._burn(account, id, amount);
        _totalSupply[id] -= amount;
    }

    /**
     * @dev See {ERC1155-_burnBatch}.
     */
    function _burnBatch(
        address account,
        uint256[] memory ids,
        uint256[] memory amounts
    ) internal virtual override {
        super._burnBatch(account, ids, amounts);
        for (uint256 i = 0; i < ids.length; ++i) {
            _totalSupply[ids[i]] -= amounts[i];
        }
    }
}

contract MemberToken is ERC1155Supply {
    using Address for address;

    IControllerRegistry public controllerRegistry;

    mapping(uint256 => address) public memberController;

    uint8 internal constant CREATE_EVENT = 0x01;

    event MigrateMemberController(uint256 podId, address newController);

    constructor(address _controllerRegistry) ERC1155("POD") {
        controllerRegistry = IControllerRegistry(_controllerRegistry);
    }

    function migrateMemberController(uint256 _podId, address _newController)
        external
    {
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

    function mint(
        address _account,
        uint256 _id,
        bytes memory data
    ) external {
        bool isCreating = uint8(data[0]) == CREATE_EVENT;

        require(exists(_id) != isCreating, "Invalid creation flag");

        if (isCreating) {
            require(
                controllerRegistry.isRegistered(msg.sender),
                "Controller not registered"
            );
            memberController[_id] = msg.sender;
        }

        _mint(_account, _id, 1, data);
    }

    function mintSingleBatch(
        address[] memory _accounts,
        uint256 _id,
        bytes memory data
    ) external {
        bool isCreating = uint8(data[0]) == CREATE_EVENT;

        require(exists(_id) != isCreating, "Invalid creation flag");

        if (isCreating) {
            require(
                controllerRegistry.isRegistered(msg.sender),
                "Controller not registered"
            );
            memberController[_id] = msg.sender;
        }

        for (uint256 index = 0; index < _accounts.length; index++) {
            _mint(_accounts[index], _id, 1, data);
        }
    }

    function burn(address _account, uint256 _id) external {
        require(balanceOf(_account, _id) == 1, "User is not a member");

        _burn(_account, _id, 1);
    }

    // this hook gets called before every token event including mint and burn
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
