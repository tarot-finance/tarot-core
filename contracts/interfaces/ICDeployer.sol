pragma solidity =0.5.16;

interface ICDeployer {
	function deployCollateral(address uniswapV2Pair) external returns (address collateral);
}