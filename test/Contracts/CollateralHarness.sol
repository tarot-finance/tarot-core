pragma solidity =0.5.16;

import "../../contracts/Collateral.sol";

contract CollateralHarness is Collateral {
	function calculateLiquidity(uint amountCollateral, uint amount0, uint amount1) external returns (uint liquidity, uint shortfall) {
		return super._calculateLiquidity(amountCollateral, amount0, amount1);
	}
	
	function setUnderlyingHarness(address _underlying) external {
		underlying = _underlying;
	}
	
	function setFactoryHarness(address _factory) external {
		factory = _factory;
	}
	
	function setBorrowable0Harness(address _borrowable0) external {
		borrowable0 = _borrowable0;
	}
	
	function setBorrowable1Harness(address _borrowable1) external {
		borrowable1 = _borrowable1;
	}
	
	function setBalanceHarness(address account, uint balance) external {
		balanceOf[account] = balance;
	}
	
	function setTotalSupply(uint _totalSupply) external {
		totalSupply = _totalSupply;
	}
	
	bool public useMockPrices;
	uint public _price0;
	uint public _price1;
	
	function getPrices() public returns (uint price0, uint price1) {
		if (useMockPrices) return (_price0, _price1);
		return super.getPrices();
	}
	
	function setPricesHarness(uint price0, uint price1) external {
		useMockPrices = true;
		_price0 = price0;
		_price1 = price1;
	}
	
	function setPriceOracle(address _tarotPriceOracle) external {
		tarotPriceOracle = _tarotPriceOracle;
	}
	
	bool public useMockExchangeRate;
	uint public _exchangeRate;
	
	function exchangeRate() public returns (uint) {
		if (useMockExchangeRate) return _exchangeRate;
		return super.exchangeRate();
	}
	
	function setExchangeRateHarness(uint __exchangeRate) external {
		useMockExchangeRate = true;
		_exchangeRate = __exchangeRate;
	}
	
	bool public useMockaAccountLiquidity;
	mapping(address => uint) public _liquidity;
	mapping(address => uint) public _shortfall;
	
	function accountLiquidity(address borrower) public returns (uint liquidity, uint shortfall) {
		if (useMockaAccountLiquidity) return (_liquidity[borrower], _shortfall[borrower]);
		return super.accountLiquidity(borrower);
	}
	
	function setAccountLiquidityHarness(address borrower, uint liquidity, uint shortfall) external {
		useMockaAccountLiquidity = true;
		_liquidity[borrower] = liquidity;
		_shortfall[borrower] = shortfall;
	}
	
	bool public useMockCanBorrow;
	mapping(address => mapping(address => uint)) public maxBorrowable;
	
	function canBorrow(address borrower, address borrowable, uint amount) public returns (bool) {
		if (useMockCanBorrow){
			return maxBorrowable[borrower][borrowable] >= amount;
		}
		return super.canBorrow(borrower, borrowable, amount);
	}
	
	function setMaxBorrowable(address borrower, address borrowable, uint maxAmount) external {
		useMockCanBorrow = true;
		maxBorrowable[borrower][borrowable] = maxAmount;
	}
	
	bool public useMockTokensUnlocked;
	
	function tokensUnlocked(address from, uint value) public returns (bool) {
		if (useMockTokensUnlocked){
			return true;
		}
		return super.tokensUnlocked(from, value);
	}
	
	function unlockTokensTransfer() external {
		useMockTokensUnlocked = true;
	}
}