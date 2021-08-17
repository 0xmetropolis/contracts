pragma solidity 0.7.4;

interface IRuleManager {

    /**
     * @param _controller The account address to be assigned as controller
     */
    function updateController(address _controller) external;

    function setPodRule(
        uint256 _podId,
        address _contractAddress,
        bytes4 _functionSignature,
        bytes32[5] memory _functionParams,
        uint256 _comparisonLogic,
        uint256 _comparisonValue
    ) external;

    /**
     * @param _podId The id number of the pod
     */
    function finalizeRule(uint256 _podId) external;

    /**
     * @param _podId The id number of the pod
     */
    function hasRules(uint256 _podId) external view returns (bool);

    /**
     * @param _podId The id number of the pod
     * @param _user The account address of a pod member
     */
    function isRuleCompliant(uint256 _podId, address _user)
        external
        view
        returns (bool);

}