pragma solidity =0.5.16;

import "./PoolToken.sol";
import "./BAllowance.sol";
import "./BInterestRateModel.sol";
import "./BSetter.sol";
import "./BStorage.sol";
import "./interfaces/IBorrowable.sol";
import "./interfaces/ICollateral.sol";
import "./interfaces/IImpermaxCallee.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IFactory.sol";

contract Borrowable is IBorrowable, PoolToken, BStorage, BSetter, BInterestRateModel, BAllowance {

	uint public constant BORROW_FEE = 0.001e18; //0.1%

	event Borrow(address indexed sender, address indexed borrower, uint borrowAmount, uint repayAmount, uint accountBorrows, uint totalBorrows);
	event Liquidate(address indexed sender, address indexed liquidator, address indexed borrower, uint repayAmount, uint actualRepayAmount, uint seizeTokens, uint accountBorrows, uint totalBorrows);
	
	constructor() public {}

	/*** PoolToken ***/
	
	function _update() internal {
		super._update();
		_calculateBorrowRate();
	}
	
	function _mintReserves(uint _exchangeRate, uint _totalSupply) internal returns (uint) {
		uint _exchangeRateLast = exchangeRateLast;
		if (_exchangeRate > _exchangeRateLast) {
			uint _exchangeRateNew = _exchangeRate.sub( _exchangeRate.sub(_exchangeRateLast).mul(reserveFactor).div(1e18) );
			uint liquidity = _totalSupply.mul(_exchangeRate).div(_exchangeRateNew).sub(_totalSupply);
			if (liquidity == 0) return _exchangeRate;
			address reservesManager = IFactory(factory).reservesManager();
			_mint(reservesManager, liquidity);
			exchangeRateLast = safe128(_exchangeRateNew);
			return _exchangeRateNew;
		}
		else return _exchangeRate;
	}
	
	function exchangeRate() public accrue returns (uint)	{
		uint _totalSupply = totalSupply;
		uint _actualBalance =  totalBalance.add(totalBorrows);
		if (_totalSupply == 0 || _actualBalance == 0) return initialExchangeRate;
		uint _exchangeRate = _actualBalance.mul(1e18).div(_totalSupply);
		return _mintReserves(_exchangeRate, _totalSupply);
	}
	
	// force totalBalance to match real balance
	function sync() external nonReentrant update accrue {}
	
	/*** Borrowable ***/

	// this is the stored borrow balance; the current borrow balance may be slightly higher
	function borrowBalance(address borrower) public view returns (uint) {
		BorrowSnapshot memory borrowSnapshot = borrowBalances[borrower];
		if (borrowSnapshot.interestIndex == 0) return 0; // not initialized
		return uint(borrowSnapshot.principal).mul(borrowIndex).div(borrowSnapshot.interestIndex);
	}
	
	function _updateBorrow(address borrower, uint borrowAmount, uint repayAmount) private returns (uint accountBorrowsPrior, uint accountBorrows, uint _totalBorrows) {
		accountBorrowsPrior = borrowBalance(borrower);
		if (borrowAmount == repayAmount) return (accountBorrowsPrior, accountBorrowsPrior, totalBorrows);
		else if (borrowAmount > repayAmount) {
			BorrowSnapshot storage borrowSnapshot = borrowBalances[borrower];
			uint increaseAmount = borrowAmount - repayAmount;
			accountBorrows = accountBorrowsPrior.add(increaseAmount);
			borrowSnapshot.principal = safe112(accountBorrows);
			borrowSnapshot.interestIndex = borrowIndex;
			_totalBorrows = uint(totalBorrows).add(increaseAmount);	
			totalBorrows = safe112(_totalBorrows);
		}
		else {
			BorrowSnapshot storage borrowSnapshot = borrowBalances[borrower];
			uint decreaseAmount = repayAmount - borrowAmount;		
			accountBorrows = accountBorrowsPrior > decreaseAmount ? accountBorrowsPrior - decreaseAmount : 0;
			borrowSnapshot.principal = safe112(accountBorrows);
			if(accountBorrows == 0) {
				borrowSnapshot.interestIndex = 0;
			} else {
				borrowSnapshot.interestIndex = borrowIndex;
			}
			uint actualDecreaseAmount = accountBorrowsPrior.sub(accountBorrows);
			_totalBorrows = totalBorrows; // gas savings
			_totalBorrows = _totalBorrows > actualDecreaseAmount ? _totalBorrows - actualDecreaseAmount : 0;
			totalBorrows = safe112(_totalBorrows);			
		}
	}
	
	// this low-level function should be called from another contract
	function borrow(address borrower, address receiver, uint borrowAmount, bytes calldata data) external nonReentrant update accrue {		
		uint _totalBalance = totalBalance;
		require(borrowAmount <= _totalBalance, "Impermax: INSUFFICIENT_CASH");
		_checkBorrowAllowance(borrower, msg.sender, borrowAmount);
		
		// optimistically transfer funds
		if (borrowAmount > 0) _safeTransfer(receiver, borrowAmount);
		if (data.length > 0) IImpermaxCallee(receiver).impermaxBorrow(msg.sender, borrower, borrowAmount, data);
		uint balance = IERC20(underlying).balanceOf(address(this));
		
		uint borrowFee = borrowAmount.mul(BORROW_FEE).div(1e18);
		uint adjustedBorrowAmount = borrowAmount.add(borrowFee);
		uint repayAmount = balance.add(borrowAmount).sub(_totalBalance);
		(, uint accountBorrows, uint _totalBorrows) = _updateBorrow(borrower, adjustedBorrowAmount, repayAmount);
		
		if(adjustedBorrowAmount > repayAmount) require(
			ICollateral(collateral).canBorrow(borrower, address(this), accountBorrows),
			"Impermax: INSUFFICIENT_LIQUIDITY"
		);
		
		emit Borrow(msg.sender, borrower, borrowAmount, repayAmount, accountBorrows, _totalBorrows);
	}

	// this low-level function should be called from another contract
	function liquidate(address borrower, address liquidator, uint repayAmount, bytes calldata data) external nonReentrant update accrue returns (uint seizeTokens) {		
		// optimistically seize tokens
		seizeTokens = ICollateral(collateral).seize(liquidator, borrower, repayAmount);	
		if (data.length > 0) IImpermaxCallee(liquidator).impermaxLiquidate(msg.sender, borrower, repayAmount, data);
			
		uint balance = IERC20(underlying).balanceOf(address(this));
		uint fullRepayAmount = balance.sub(totalBalance);		
		(uint accountBorrowsPrior, uint accountBorrows, uint _totalBorrows) = _updateBorrow(borrower, 0, fullRepayAmount);
		uint actualRepayAmount = accountBorrowsPrior.sub(accountBorrows);
		require(actualRepayAmount >= repayAmount, "Impermax: INSUFFICIENT_REPAY");		
				
		emit Liquidate(msg.sender, liquidator, borrower, repayAmount, actualRepayAmount, seizeTokens, accountBorrows, _totalBorrows);
	}
	
	modifier accrue() {
		accrueInterest();
		_;
	}
}