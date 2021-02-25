pragma solidity 0.7.4;

contract GenericFunctionTest {
    constructor(address balanceContractAddress) public {
        address balance = balanceContractAddress;

        bytes4 funnctionSigAddress =
            bytes4(keccak256("balanceOfAddress(address)"));
        bytes4 funnctionSigInt = bytes4(keccak256("balanceOfInt(uint256)"));
        bytes4 funnctionSigMulti =
            bytes4(keccak256("balanceOfMulti(address,uint256,bytes32)"));

        bytes32[5] memory functionParametersNoKeyWord;
        functionParametersNoKeyWord[0] = bytes32(uint256(msg.sender));
        functionParametersNoKeyWord[1] = bytes32(uint256(500));
        functionParametersNoKeyWord[2] = bytes32("hello");

        bytes32[5] memory functionParametersKeyWord;
        functionParametersKeyWord[0] = bytes32("msg.sender");
        functionParametersKeyWord[1] = bytes32(uint256(400));
        functionParametersKeyWord[2] = bytes32("hello");

        // basic call test  w/ one address param

        // commented out to not exceed stack limit w/ local vars
        // (bool successAddress, bytes memory resultAddress) = balance.call(abi.encodePacked(funnctionSigAddress, functionParametersNoKeyWord[0]));
        // require(successAddress == true, "Address Transaction Unsuccessful");
        // require(toUint256(resultAddress) == 100, "Transaction Return Not Expected");

        // basic call test  w/ one address param

        // commented out to not exceed stack limit w/ local vars
        // (bool successInt, bytes memory resultInt) = balance.call(abi.encodePacked(funnctionSigInt, functionParametersNoKeyWord[1]));
        // require(successInt == true, "Int Transaction Unsuccessful");
        // require(toUint256(resultInt) == 101, "Transaction Return Not Expected");

        // call with multiple params

        (bool successMulti, bytes memory resultMulti) =
            balance.call(
                abi.encodePacked(
                    funnctionSigMulti,
                    functionParametersNoKeyWord[0],
                    functionParametersNoKeyWord[1],
                    functionParametersNoKeyWord[2]
                )
            );
        require(successMulti == true, "Multi Transaction Unsuccessful");
        require(
            toUint256(resultMulti) == 102,
            "Transaction Multi Not Expected"
        );

        // replace keywords w/o key keywords ( no replacements )

        for (uint256 i = 0; i < functionParametersNoKeyWord.length; i++) {
            if (functionParametersNoKeyWord[i] == bytes32("msg.sender")) {
                functionParametersNoKeyWord[i] = bytes32(uint256(msg.sender));
            }
        }
        (bool successMultiNoReplace, bytes memory resultMultiNoReplace) =
            balance.call(
                abi.encodePacked(
                    funnctionSigMulti,
                    functionParametersNoKeyWord[0],
                    functionParametersNoKeyWord[1],
                    functionParametersNoKeyWord[2]
                )
            );
        require(
            successMultiNoReplace == true,
            "Multi No Replace Transaction Unsuccessful"
        );
        require(
            toUint256(resultMultiNoReplace) == 102,
            "Transaction Multi No Replace Not Expected"
        );

        // replace keywords with keywords (one replacement)
        for (uint256 i = 0; i < functionParametersKeyWord.length; i++) {
            if (functionParametersKeyWord[i] == bytes32("msg.sender")) {
                functionParametersKeyWord[i] = bytes32(uint256(msg.sender));
            }
        }
        (bool successMultiReplace, bytes memory resultMultiReplace) =
            balance.call(
                abi.encodePacked(
                    funnctionSigMulti,
                    functionParametersKeyWord[0],
                    functionParametersKeyWord[1],
                    functionParametersKeyWord[2]
                )
            );
        require(
            successMultiReplace == true,
            "Multi With Replace Transaction Unsuccessful"
        );
        require(
            toUint256(resultMultiReplace) == 102,
            "Transaction Result Multi With Replace Not Expected"
        );

        // used replaced data with an extra arguements (this allows you to call a function expecting 1 arg, but sending 5)
        // is more gas, but makes like easier than trying to figure out the  # of params to send
        bytes memory extendedCallData =
            abi.encodePacked(
                funnctionSigMulti,
                functionParametersKeyWord[0],
                functionParametersKeyWord[1],
                functionParametersKeyWord[2],
                functionParametersKeyWord[3],
                functionParametersKeyWord[4]
            );
        (bool extendedCallDataSuccess, bytes memory extendedCallDataResult) =
            balance.call(extendedCallData);
        require(
            extendedCallDataSuccess == true,
            "Multi With Replace Transaction Unsuccessful"
        );
        require(
            toUint256(extendedCallDataResult) == 102,
            "Transaction Result Multi With Replace Not Expected"
        );
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
