pragma solidity ^0.4.24;

import "../../contracts/PAXGImplementation.sol";


contract PAXGWithBalance is PAXGImplementation {

    function initializeBalance(address initialAccount, uint initialBalance) public {
        balances[initialAccount] = initialBalance;
        totalSupply_ = initialBalance;
    }

    function topupBalance(address _to, uint256 desiredBalance) public {
        if (desiredBalance < balances[_to]) {
           return;
        }

        uint256 toAdd = desiredBalance.sub(balances[_to]);
        balances[_to] = desiredBalance;
        totalSupply_ = totalSupply_.add(toAdd);
    }
}
