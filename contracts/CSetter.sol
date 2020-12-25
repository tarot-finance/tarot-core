pragma solidity =0.5.16;

import "./CStorage.sol";
import "./PoolToken.sol";
import "./interfaces/IFactory.sol";
import "./interfaces/ISimpleUniswapOracle.sol";

contract CSetter is PoolToken, CStorage {

	uint public constant SAFETY_MARGIN_SQRT_MIN = 1.22474487e18; //safetyMargin: 150%
	uint public constant SAFETY_MARGIN_SQRT_MAX = 1.58113884e18; //safetyMargin: 250%
	uint public constant LIQUIDATION_INCENTIVE_MIN = 1.01e18; //101%
	uint public constant LIQUIDATION_INCENTIVE_MAX = 1.05e18; //105%

	event NewSafetyMargin(uint oldSafetyMarginSqrt, uint newSafetyMarginSqrt);
	event NewLiquidationIncentive(uint oldLiquidationIncentive, uint newLiquidationIncentive);
	
	// called once by the factory at the time of deployment
	function _initialize (
		string calldata _name,
		string calldata _symbol,
		address _underlying, 
		address _borrowable0, 
		address _borrowable1
	) external {
		require(msg.sender == factory, "Impermax: UNAUTHORIZED"); // sufficient check
		_setName(_name, _symbol);
		underlying = _underlying;
		borrowable0 = _borrowable0;
		borrowable1 = _borrowable1;
		simpleUniswapOracle = IFactory(factory).simpleUniswapOracle();
	}

	function _setSafetyMarginSqrt(uint newSafetyMarginSqrt) external nonReentrant {
		require(msg.sender == IFactory(factory).admin(), "Impermax: UNAUTHORIZED");
		require(newSafetyMarginSqrt <= SAFETY_MARGIN_SQRT_MAX, "Impermax: INVALID_SETTING");
		require(newSafetyMarginSqrt >= SAFETY_MARGIN_SQRT_MIN, "Impermax: INVALID_SETTING");
		uint oldSafetyMarginSqrt = safetyMarginSqrt;
		safetyMarginSqrt = newSafetyMarginSqrt;
		emit NewSafetyMargin(oldSafetyMarginSqrt, newSafetyMarginSqrt);
	}

	function _setLiquidationIncentive(uint newLiquidationIncentive) external nonReentrant {
		require(msg.sender == IFactory(factory).admin(), "Impermax: UNAUTHORIZED");
		require(newLiquidationIncentive <= LIQUIDATION_INCENTIVE_MAX, "Impermax: INVALID_SETTING");
		require(newLiquidationIncentive >= LIQUIDATION_INCENTIVE_MIN, "Impermax: INVALID_SETTING");
		uint oldLiquidationIncentive = liquidationIncentive;
		liquidationIncentive = newLiquidationIncentive;
		emit NewLiquidationIncentive(oldLiquidationIncentive, newLiquidationIncentive);
	}
}