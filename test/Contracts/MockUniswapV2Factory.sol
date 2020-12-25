pragma solidity =0.5.16;

contract MockUniswapV2Factory {

	mapping(address => mapping(address => address)) public getPair;
	
	constructor () public {}
	
	function addPair(address token0, address token1, address uniPair) public {
		getPair[token0][token1] = uniPair;
		getPair[token1][token0] = uniPair;
	}
	
}