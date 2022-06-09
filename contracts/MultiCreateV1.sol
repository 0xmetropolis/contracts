pragma solidity ^0.8.7;
import "./interfaces/IControllerV1.sol";
import "./interfaces/IMemberToken.sol";

/* solhint-disable indent */

contract MultiCreateV1 {
    IMemberToken immutable memberToken;

    constructor(address _memberToken) {
        memberToken = IMemberToken(_memberToken);
    }

    function createPods(
        IControllerV1 _controller,
        address[][] memory _members,
        uint256[] calldata _thresholds,
        address[] memory _admins,
        bytes32[] memory _labels,
        string[] memory _ensStrings,
        string[] memory _imageUrls
    ) public returns (address[] memory) {
        uint256 numPods = _thresholds.length;
        require(_members.length == numPods, "incorrect members array");
        require(_labels.length == numPods, "incorrect labels array");
        require(_ensStrings.length == numPods, "incorrect ensStrings array");
        require(_imageUrls.length == numPods, "incorrect imageUrls array");

        uint256 nextPodId = memberToken.getNextAvailablePodId();

        // 1 indexing to avoid relying on address(0)
        address[] memory newPods = new address[](numPods + 1);

        for (uint256 i = 0; i < numPods; i++) {
            // if the numerical version of admin address is less than numPods + 1 and not address(0) its a pointer
            if (
                uint256(uint160(_admins[i])) <= numPods + 1 ||
                _admins[i] == address(0)
            ) {
                // pointer must be under the current pod index
                require(
                    uint256(uint160(_admins[i])) < i + 1,
                    "Admin dependency bad ordering"
                );
                // overwrite admin with new pod address
                _admins[i] = newPods[uint256(uint160(_admins[i]))];
            }

            for (uint256 j = 0; j < _members[i].length; j++) {
                // if the numerical version of member address is less than numPods + 1 its a pointer
                if (uint256(uint160(_members[i][j])) <= numPods + 1) {
                    // pointer must be under the current pod index
                    require(
                        uint256(uint160(_members[i][j])) < i + 1,
                        "Member dependency bad ordering"
                    );
                    // overwrite member with new pod address
                    _members[i][j] = newPods[uint256(uint160(_members[i][j]))];
                }
            }

            _controller.createPod(
                _members[i],
                _thresholds[i],
                _admins[i],
                _labels[i],
                _ensStrings[i],
                nextPodId + i,
                _imageUrls[i]
            );
            // store new pods with 1 index
            newPods[i + 1] = _controller.podIdToSafe(nextPodId + (i));
        }
        return newPods;
    }
}
