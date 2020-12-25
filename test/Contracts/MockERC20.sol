pragma solidity =0.5.16;

import "../../contracts/interfaces/IERC20.sol";
import "../../contracts/libraries/SafeMath.sol";

contract MockERC20 is IERC20 {
	using SafeMath for uint256;

	mapping (address => uint256) internal _balances;

	mapping (address => mapping (address => uint256)) internal _allowances;

	uint256 internal _totalSupply;

	string internal _name;
	string internal _symbol;
	uint8 internal _decimals;

	constructor (string memory name, string memory symbol) public {
		_name = name;
		_symbol = symbol;
		_decimals = 18;
	}

	function name() external view returns (string memory) {
		return _name;
	}

	function symbol() external view returns (string memory) {
		return _symbol;
	}
	
	function decimals() external view returns (uint8) {
		return _decimals;
	}

	function totalSupply() external view returns (uint256) {
		return _totalSupply;
	}

	function balanceOf(address account) external view returns (uint256) {
		return _balances[account];
	}
	
	function transfer(address to, uint256 amount) external returns (bool) {
		_transfer(msg.sender, to, amount);
		return true;
	}
	
	function allowance(address owner, address spender) external view returns (uint256) {
		return _allowances[owner][spender];
	}

	function approve(address spender, uint256 amount) external returns (bool) {
		_approve(msg.sender, spender, amount);
		return true;
	}

	function transferFrom(address from, address to, uint256 amount) external returns (bool) {
		_transfer(from, to, amount);
		_approve(from, msg.sender, _allowances[from][msg.sender].sub(amount, "ERC20: transfer amount exceeds allowance"));
		return true;
	}
	
	function mint(address account, uint256 amount) external {
		_mint(account, amount);
	}
	
	function burn(address account, uint256 amount) external {
		_burn(account, amount);
	}

	function _transfer(address from, address to, uint256 amount) internal {
		_balances[from] = _balances[from].sub(amount, "ERC20: transfer amount exceeds balance");
		_balances[to] = _balances[to].add(amount);
		emit Transfer(from, to, amount);
	}

	function _mint(address account, uint256 amount) internal {
		_totalSupply = _totalSupply.add(amount);
		_balances[account] = _balances[account].add(amount);
		emit Transfer(address(0), account, amount);
	}
	
	function _burn(address account, uint256 amount) internal {
		_balances[account] = _balances[account].sub(amount, "ERC20: burn amount exceeds balance");
		_totalSupply = _totalSupply.sub(amount);
		emit Transfer(account, address(0), amount);
	}
	
	function _approve(address owner, address spender, uint256 amount) internal {
		_allowances[owner][spender] = amount;
		emit Approval(owner, spender, amount);
	}
}
