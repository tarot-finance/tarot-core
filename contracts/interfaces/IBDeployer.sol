pragma solidity =0.5.16;

interface IBDeployer {
	function deployBorrowable(address uniswapV2Pair, address token) external returns (address borrowable);
}