pragma solidity =0.5.16;

import "../../contracts/libraries/UQ112x112.sol";
import "../../contracts/interfaces/IUniswapV2Pair.sol";
import "../../contracts/interfaces/ITarotPriceOracle.sol";

contract MockOracle is ITarotPriceOracle {
	using UQ112x112 for uint224;
	
	uint32 public constant MIN_T = 1200;
	struct Pair {
        uint256 priceCumulativeSlotA;
        uint256 priceCumulativeSlotB;
        uint32 lastUpdateSlotA;
        uint32 lastUpdateSlotB;
        bool latestIsSlotA;
        bool initialized;
	}
	mapping(address => Pair) public getPair;
	
	mapping(address => uint224) public mockPrice;
	
	function initialize(address uniswapV2Pair) external {
		require(!getPair[uniswapV2Pair].initialized, "AssertError: pair is already initialized");
		getPair[uniswapV2Pair].initialized = true;
		mockPrice[uniswapV2Pair] = 2**112;
	}
	
	function getResult(address uniswapV2Pair) external returns (uint224 price, uint32 T) {
		price = mockPrice[uniswapV2Pair];
		T = 1200;
	}
	
	function setPrice(address uniswapV2Pair, uint224 price) external {
		mockPrice[uniswapV2Pair] = price;
	}
	
	/*** Utilities ***/
	
	function getBlockTimestamp() public view returns (uint32) {
		return uint32(block.timestamp % 2**32);
	}
}