pragma solidity =0.5.16;

import "../../contracts/BAllowance.sol";

contract BAllowanceHarness is BAllowance {
	constructor(string memory _name, string memory _symbol) public ImpermaxERC20() {
		_setName(_name, _symbol);
	}
	
	function checkBorrowAllowance(address owner, address spender, uint amount) external {
		super._checkBorrowAllowance(owner, spender, amount);
	}
}