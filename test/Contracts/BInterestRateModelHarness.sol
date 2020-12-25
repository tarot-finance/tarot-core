pragma solidity =0.5.16;

import "../../contracts/BInterestRateModel.sol";

contract BInterestRateModelHarness is BInterestRateModel {

	function calculateBorrowRate() external {
		super._calculateBorrowRate();
	}
	
	function setBorrowRate(uint48 _borrowRate) public {
		borrowRate = _borrowRate;
	}
	
	function setKinkUtilizationRate(uint _kinkUtilizationRate) public {
		kinkUtilizationRate = _kinkUtilizationRate;
	}
	
	function setTotalBorrows(uint112 _totalBorrows) public {
		totalBorrows = _totalBorrows;
	}
	
	function setTotalBalance(uint _totalBalance) public {
		totalBalance = _totalBalance;
	}
	
	function setAdjustSpeed(uint _adjustSpeed) public {
		adjustSpeed = _adjustSpeed;
	}

}