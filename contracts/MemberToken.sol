pragma solidity 0.7.4;

/* solhint-disable indent */

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/utils/Address.sol";

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

    address controller;

    event ControllerUpdated(address newController);

    constructor() public ERC1155("POD") {
        emit ControllerUpdated(msg.sender);
        controller = msg.sender;
    }

    function updateController(address _controller) public {
        require(controller == msg.sender, "!controller");
        emit ControllerUpdated(controller);
        controller = _controller;
    }

    function mint(
        address _account,
        uint256 _id,
        bytes memory data
    ) public {
        require(controller == msg.sender, "!controller");

        require(balanceOf(_account, _id) == 0, "User is already member");

        _mint(_account, _id, 1, data);
    }

    function mintSingleBatch(
        address[] memory _accounts,
        uint256 _id,
        bytes memory data
    ) public {
        require(controller == msg.sender, "!controller");

        for (uint256 index = 0; index < _accounts.length; index++) {
            require(
                balanceOf(_accounts[index], _id) == 0,
                "User is already member"
            );

            _mint(_accounts[index], _id, 1, data);
        }
    }

    function burn(address _account, uint256 _id) public {
        require(controller == msg.sender, "!controller");

        require(balanceOf(_account, _id) == 1, "User is not a member");

        _burn(_account, _id, 1);
    }

    function _isMember(address _account, uint256[] memory _ids) private {
        for (uint256 i = 0; i < _ids.length; i += 1) {
            require(
                balanceOf(_account, _ids[i]) == 0,
                "User is already member"
            );
        }
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
        // check if recipient is already member
        if (to != address(0)) _isMember(to, ids);

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
