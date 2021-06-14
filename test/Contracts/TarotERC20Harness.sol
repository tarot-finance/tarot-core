pragma solidity =0.5.16;

import "../../contracts/TarotERC20.sol";

contract TarotERC20Harness is TarotERC20 {
    constructor(string memory _name, string memory _symbol)
        public
        TarotERC20()
    {
        _setName(_name, _symbol);
    }

    function mint(address to, uint256 value) public {
        super._mint(to, value);
    }

    function burn(address from, uint256 value) public {
        super._burn(from, value);
    }

    function setBalanceHarness(address account, uint256 amount) external {
        balanceOf[account] = amount;
    }
}
