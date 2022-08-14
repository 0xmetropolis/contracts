pragma solidity ^0.8.7;

contract MockProxyFactory {
    function createProxy(address gnosisMaster, bytes memory setupData)
        public
        returns (address)
    {
        return address(0x1337f);
    }
}
