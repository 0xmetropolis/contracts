pragma solidity 0.7.4;

/* solhint-disable indent */

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/utils/Address.sol";

string constant beforeTokenTransferSig = "beforeTokenTransfer(address,address,address,uint256[],uint256[],bytes)";

contract MemberToken is ERC1155 {
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
        // if the operator is not controller and is a transfer event
        if (operator != controller && from != address(0) && to != address(0)) {
            // check if recipient is already member
            _isMember(to, ids);

            // perform orca token transfer validations
            controller.functionCall(
                abi.encodeWithSignature(
                    beforeTokenTransferSig,
                    address(this),
                    from,
                    to,
                    ids,
                    amounts,
                    data
                )
            );
        }
    }
}
