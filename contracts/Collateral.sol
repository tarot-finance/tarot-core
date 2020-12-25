pragma solidity =0.5.16;

import "./PoolToken.sol";
import "./CStorage.sol";
import "./CSetter.sol";
import "./interfaces/IBorrowable.sol";
import "./interfaces/ICollateral.sol";
import "./interfaces/IFactory.sol";
import "./interfaces/ISimpleUniswapOracle.sol";
import "./interfaces/IUniswapV2Pair.sol";
import "./libraries/UQ112x112.sol";
import "./libraries/Math.sol";

contract Collateral is ICollateral, PoolToken, CStorage, CSetter {
    using UQ112x112 for uint224;
	
	constructor() public {}
	
	/*** Collateralization Model ***/

	// returns the prices of borrowable0's and borrowable1's underlyings with collateral's underlying as denom
	function getPrices() public returns (uint price0, uint price1) {
		(uint224 twapPrice112x112,) = ISimpleUniswapOracle(simpleUniswapOracle).getResult(underlying);
		(uint112 reserve0, uint112 reserve1,) = IUniswapV2Pair(underlying).getReserves();
		uint256 collateralTotalSupply = IUniswapV2Pair(underlying).totalSupply();
		
		uint224 currentPrice112x112 = UQ112x112.encode(reserve1).uqdiv(reserve0);
		uint256 adjustmentSquared = uint256(twapPrice112x112).mul(2**32).div(currentPrice112x112);
		uint256 adjustment = Math.sqrt(adjustmentSquared.mul(2**32));

		uint256 currentBorrowable0Price = uint256(collateralTotalSupply).mul(1e18).div(reserve0*2);
		uint256 currentBorrowable1Price = uint256(collateralTotalSupply).mul(1e18).div(reserve1*2);
		
		price0 = currentBorrowable0Price.mul(adjustment).div(2**32);
		price1 = currentBorrowable1Price.mul(2**32).div(adjustment);
		
		/*
		 * Price calculation errors may happen in some edge pairs where
		 * reserve0 / reserve1 is close to 2**112 or 1/2**112
		 * We're going to prevent users from using pairs at risk from the UI
		 */
		require(price0 > 100, "Impermax: PRICE_CALCULATION_ERROR");
		require(price1 > 100, "Impermax: PRICE_CALCULATION_ERROR");
	}
	
	// returns liquidity in  collateral's underlying
	function _calculateLiquidity(uint amountCollateral, uint amount0, uint amount1) internal returns (uint liquidity, uint shortfall) {
		uint _safetyMarginSqrt = safetyMarginSqrt;
		(uint price0, uint price1) = getPrices();
		
		uint a = amount0.mul(price0).div(1e18);
		uint b = amount1.mul(price1).div(1e18);
		if(a < b) (a, b) = (b, a);
		a = a.mul(_safetyMarginSqrt).div(1e18);
		b = b.mul(1e18).div(_safetyMarginSqrt);
		uint collateralNeeded = a.add(b).mul(liquidationIncentive).div(1e18);		

		if(amountCollateral >= collateralNeeded){
			return (amountCollateral - collateralNeeded, 0);
		} else {
			return (0, collateralNeeded - amountCollateral);
		}
	}

	/*** ERC20 ***/
	
	function _transfer(address from, address to, uint value) internal {
		require(tokensUnlocked(from, value), "Impermax: INSUFFICIENT_LIQUIDITY");
		super._transfer(from, to, value);
	}
	
	function tokensUnlocked(address from, uint value) public returns (bool) {
		uint _balance = balanceOf[from];
		if (value > _balance) return false;
		uint finalBalance = _balance - value;
		uint amountCollateral = finalBalance.mul(exchangeRate()).div(1e18);
		uint amount0 = IBorrowable(borrowable0).borrowBalance(from);
		uint amount1 = IBorrowable(borrowable1).borrowBalance(from);
		(, uint shortfall) = _calculateLiquidity(amountCollateral, amount0, amount1);
		return shortfall == 0;
	}
	
	/*** Collateral ***/
	
	function accountLiquidityAmounts(address borrower, uint amount0, uint amount1) public returns (uint liquidity, uint shortfall) {
		if (amount0 == uint(-1)) amount0 = IBorrowable(borrowable0).borrowBalance(borrower);
		if (amount1 == uint(-1)) amount1 = IBorrowable(borrowable1).borrowBalance(borrower);
		uint amountCollateral = balanceOf[borrower].mul(exchangeRate()).div(1e18);
		return _calculateLiquidity(amountCollateral, amount0, amount1);
	}
	
	function accountLiquidity(address borrower) public returns (uint liquidity, uint shortfall) {
		return accountLiquidityAmounts(borrower, uint(-1), uint(-1));
	}
	
	function canBorrow(address borrower, address borrowable, uint accountBorrows) public returns (bool) {
		address _borrowable0 = borrowable0;
		address _borrowable1 = borrowable1;
		require(borrowable == _borrowable0 || borrowable == _borrowable1, "Impermax: INVALID_BORROWABLE" );
		uint amount0 = borrowable == _borrowable0 ? accountBorrows : uint(-1);
		uint amount1 = borrowable == _borrowable1 ? accountBorrows : uint(-1);
		(, uint shortfall) = accountLiquidityAmounts(borrower, amount0, amount1);
		return shortfall == 0;
	}
	
	// this function must be called from borrowable0 or borrowable1
	function seize(address liquidator, address borrower, uint repayAmount) external returns (uint seizeTokens) {
		require(msg.sender == borrowable0 || msg.sender == borrowable1, "Impermax: UNAUTHORIZED");
		
		(, uint shortfall) = accountLiquidity(borrower);
		require(shortfall > 0, "Impermax: INSUFFICIENT_SHORTFALL");
		
		uint price;
		if (msg.sender == borrowable0) (price, ) = getPrices();
		else  (, price) = getPrices();
		
		seizeTokens = repayAmount.mul(liquidationIncentive).div(1e18).mul(price).div( exchangeRate() );
		
		balanceOf[borrower] = balanceOf[borrower].sub(seizeTokens, "Impermax: LIQUIDATING_TOO_MUCH");
		balanceOf[liquidator] = balanceOf[liquidator].add(seizeTokens);
		emit Transfer(borrower, liquidator, seizeTokens);
	}
}