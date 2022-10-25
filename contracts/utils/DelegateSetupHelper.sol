pragma solidity 0.8.7;

// These functions are not used by the SafeTeller directly, so have been moved
// to their own contract
contract DelegateSetupHelper {
    // In our `SafeTeller.createSafe()` function, we call `GnosisSafeProxyFactory.createProxyWithNonce()`
    // with a callback to this `delegateSetup()` function. The proxy factory will then call this function
    // via a delegate call.
    // In the context of this delegate call, `this` will refer to the proxy factory, which then in turn makes a
    // delegate call to GnosisSafe, and `this` will then refer to GnosisSafe
    // therefore this function will call `GnosisSafe.enableModule()`, which is inherited from `ModuleManager`.
    function delegateSetup(address _context) external {
        this.enableModule(_context);
    }

    // This function is here solely to allow compilation.
    // This function should not be called, see the above doc block for explanation.
    function enableModule(address) external {
        revert("should not be called");
    }
}
