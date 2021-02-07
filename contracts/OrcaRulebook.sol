pragma solidity 0.7.4;

/* solhint-disable indent */

// This contract manages the membership rules
// it is responsible for distributing and retracting memberships

contract OrcaRulebook {
    // Rules
    struct Rule {
        address contractAddress;
        bytes4 functionSignature;
        bytes32[5] functionParams;
        uint256 comparisonLogic;
        uint256 comparisonValue;
        bool isFinalized;
    }

    mapping(uint256 => Rule) public rulesByPod;

    event CreateRule(
        uint256 podId,
        address contractAddress,
        bytes4 functionSignature,
        bytes32[5] functionParams,
        uint256 comparisonLogic,
        uint256 comparisonValue
    );

    event UpdateRule(
        uint256 podId,
        address contractAddress,
        bytes4 functionSignature,
        bytes32[5] functionParams,
        uint256 comparisonLogic,
        uint256 comparisonValue
    );

    function setPodRule(
        uint256 _podId,
        address _contractAddress,
        bytes4 _functionSignature,
        bytes32[5] memory _functionParams,
        uint256 _comparisonLogic,
        uint256 _comparisonValue
    ) public {
        rulesByPod[_podId] = Rule(
            _contractAddress,
            _functionSignature,
            _functionParams,
            _comparisonLogic,
            _comparisonValue,
            false
        );
    }

    function finalizePodRule(uint256 _podId) public {
        rulesByPod[_podId].isFinalized = true;

        emit UpdateRule(
            _podId,
            rulesByPod[_podId].contractAddress,
            rulesByPod[_podId].functionSignature,
            rulesByPod[_podId].functionParams,
            rulesByPod[_podId].comparisonLogic,
            rulesByPod[_podId].comparisonValue
        );
    }

    function isRuleCompliant(uint256 _podId, address _user)
        public
        returns (bool)
    {
        Rule memory currentRule = rulesByPod[_podId];
        require(currentRule.contractAddress != address(0), "No rule set");

        // check function params for keywords
        for (uint256 i = 0; i < currentRule.functionParams.length; i++) {
            if (currentRule.functionParams[i] == bytes32("MEMBER")) {
                currentRule.functionParams[i] = bytes32(uint256(_user));
            }
        }

        (bool success, bytes memory result) =
            currentRule.contractAddress.call(
                abi.encodePacked(
                    currentRule.functionSignature,
                    currentRule.functionParams[0],
                    currentRule.functionParams[1],
                    currentRule.functionParams[2],
                    currentRule.functionParams[3],
                    currentRule.functionParams[4]
                )
            );
        require(success == true, "Rule Transaction Failed");

        if (currentRule.comparisonLogic == 0) {
            return toUint256(result) == currentRule.comparisonValue;
        }
        if (currentRule.comparisonLogic == 1) {
            return toUint256(result) > currentRule.comparisonValue;
        }
        if (currentRule.comparisonLogic == 2) {
            return toUint256(result) < currentRule.comparisonValue;
        }
        // if invalid rule it is impossible to be compliant
        return false;
    }

    function toUint256(bytes memory _bytes)
        internal
        pure
        returns (uint256 value)
    {
        assembly {
            value := mload(add(_bytes, 0x20))
        }
    }
}
