pragma solidity =0.5.16;

import "./BStorage.sol";
import "./PoolToken.sol";
import "./interfaces/IFactory.sol";

contract BSetter is PoolToken, BStorage {

	uint public constant RESERVE_FACTOR_MAX = 0.20e18; //20%
	uint public constant KINK_UR_MIN = 0.6e18; //60%
	uint public constant KINK_UR_MAX = 0.9e18; //90%
	uint public constant ADJUST_SPEED_MIN = 0.05787037e12; //0.5% per day
	uint public constant ADJUST_SPEED_MAX = 5.787037e12; //50% per day

	event NewReserveFactor(uint oldReserveFactor, uint newReserveFactor);
	event NewKinkUtilizationRate(uint oldKinkUtilizationRate, uint newKinkUtilizationRate);
	event NewAdjustSpeed(uint oldAdjustSpeed, uint newAdjustSpeed);
	
	// called once by the factory at time of deployment
	function _initialize (
		string calldata _name, 
		string calldata _symbol,
		address _underlying, 
		address _collateral
	) external {
		require(msg.sender == factory, "Impermax: UNAUTHORIZED"); // sufficient check
		_setName(_name, _symbol);
		underlying = _underlying;
		collateral = _collateral;
		exchangeRateLast = safe128(initialExchangeRate);
	}
	
	function _setReserveFactor(uint newReserveFactor) external nonReentrant {
		require(msg.sender == IFactory(factory).admin(), "Impermax: UNAUTHORIZED");
		require(newReserveFactor <= RESERVE_FACTOR_MAX, "Impermax: INVALID_SETTING");
		uint oldReserveFactor = reserveFactor;
		reserveFactor = newReserveFactor;
		emit NewReserveFactor(oldReserveFactor, newReserveFactor);
	}

	function _setKinkUtilizationRate(uint newKinkUtilizationRate) external nonReentrant {
		require(msg.sender == IFactory(factory).admin(), "Impermax: UNAUTHORIZED");
		require(newKinkUtilizationRate <= KINK_UR_MAX, "Impermax: INVALID_SETTING");
		require(newKinkUtilizationRate >= KINK_UR_MIN, "Impermax: INVALID_SETTING");
		uint oldKinkUtilizationRate = kinkUtilizationRate;
		kinkUtilizationRate = newKinkUtilizationRate;
		emit NewKinkUtilizationRate(oldKinkUtilizationRate, newKinkUtilizationRate);
	}

	function _setAdjustSpeed(uint newAdjustSpeed) external nonReentrant {
		require(msg.sender == IFactory(factory).admin(), "Impermax: UNAUTHORIZED");
		require(newAdjustSpeed >= ADJUST_SPEED_MIN, "Impermax: INVALID_SETTING");
		require(newAdjustSpeed <= ADJUST_SPEED_MAX, "Impermax: INVALID_SETTING");
		uint oldAdjustSpeed = adjustSpeed;
		adjustSpeed = newAdjustSpeed;
		emit NewAdjustSpeed(oldAdjustSpeed, newAdjustSpeed);
	}
}