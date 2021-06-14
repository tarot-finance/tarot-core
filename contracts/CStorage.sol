pragma solidity =0.5.16;


contract CStorage {
	address public borrowable0;
	address public borrowable1;
	address public tarotPriceOracle;
	uint public safetyMarginSqrt = 1.58113883e18; //safetyMargin: 250%
	uint public liquidationIncentive = 1.04e18; //4%
}