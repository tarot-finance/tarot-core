pragma solidity =0.5.16;

import "../../contracts/libraries/SafeMath.sol";
import "../../contracts/interfaces/IUniswapV2Pair.sol";
import "../../contracts/libraries/UQ112x112.sol";
import "./MockERC20.sol";

contract MockUniswapV2Pair is MockERC20 {
	using SafeMath for uint256;
	using UQ112x112 for uint224;
	
	address public token0;
	address public token1;
	
	constructor (address _token0, address _token1) MockERC20("", "") public {
		blockTimestampLast = uint32(block.timestamp % 2**32);
		token0 = _token0;
		token1 = _token1;
		_totalSupply = 1e9;
	}
	
	uint256 public price0CumulativeLast;
	uint112 internal reserve0 = 1e9;
	uint112 internal reserve1 = 1e9;
	uint32 internal blockTimestampLast;
	
	function getReserves() external view returns (uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast) {
		_reserve0 = reserve0;
		_reserve1 = reserve1;
		_blockTimestampLast = blockTimestampLast;
	}
	
	function setReserves(uint112 _reserve0, uint112 _reserve1) external {
		reserve0 = _reserve0;
		reserve1 = _reserve1;
	}
	
	function setTotalSupply(uint __totalSupply) external {
		_totalSupply = __totalSupply;
	}
	
	function setBalanceHarness(address account, uint amount) external {
		_balances[account] = amount;
	}
	
	function toUint112(uint256 input) internal pure returns(uint112) {
		require(input <= uint112(-1), "MockUniPair: UINT224_OVERFLOW");
		return uint112(input);
	}
}