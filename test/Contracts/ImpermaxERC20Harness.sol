pragma solidity =0.5.16;

import "../../contracts/ImpermaxERC20.sol";

contract ImpermaxERC20Harness is ImpermaxERC20 {
	constructor(string memory _name, string memory _symbol) public ImpermaxERC20() {
		_setName(_name, _symbol);
	}
	
	function mint(address to, uint value) public {
		super._mint(to, value);
	}

	function burn(address from, uint value) public {
		super._burn(from, value);
	}
	
	function setBalanceHarness(address account, uint amount) external {
		balanceOf[account] = amount;
	}
}