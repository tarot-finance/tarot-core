pragma solidity =0.5.16;

import "./CStorage.sol";
import "./PoolToken.sol";
import "./interfaces/IFactory.sol";
import "./interfaces/ISimpleUniswapOracle.sol";

contract CSetter is PoolToken, CStorage {

	uint public constant SAFETY_MARGIN_SQRT_MIN = 1.00e18; //safetyMargin: 100%
	uint public constant SAFETY_MARGIN_SQRT_MAX = 1.58113884e18; //safetyMargin: 250%
	uint public constant LIQUIDATION_INCENTIVE_MIN = 1.00e18; //100%
	uint public constant LIQUIDATION_INCENTIVE_MAX = 1.05e18; //105%

	event NewSafetyMargin(uint newSafetyMarginSqrt);
	event NewLiquidationIncentive(uint newLiquidationIncentive);
	
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
		_checkSetting(newSafetyMarginSqrt, SAFETY_MARGIN_SQRT_MIN, SAFETY_MARGIN_SQRT_MAX);
		safetyMarginSqrt = newSafetyMarginSqrt;
		emit NewSafetyMargin(newSafetyMarginSqrt);
	}

	function _setLiquidationIncentive(uint newLiquidationIncentive) external nonReentrant {
		_checkSetting(newLiquidationIncentive, LIQUIDATION_INCENTIVE_MIN, LIQUIDATION_INCENTIVE_MAX);
		liquidationIncentive = newLiquidationIncentive;
		emit NewLiquidationIncentive(newLiquidationIncentive);
	}
	
	function _checkSetting(uint parameter, uint min, uint max) internal view {
		_checkAdmin();
		require(parameter >= min, "Impermax: INVALID_SETTING");
		require(parameter <= max, "Impermax: INVALID_SETTING");
	}
	
	function _checkAdmin() internal view {
		require(msg.sender == IFactory(factory).admin(), "Impermax: UNAUTHORIZED");
	}
}