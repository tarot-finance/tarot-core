const {
	makeFactory,
	makeUniswapV2Pair,
} = require('./Utils/Impermax');
const {
	expectEqual,
	expectAlmostEqualMantissa,
	expectRevert,
	expectEvent,
	bnMantissa,
	BN,
	uq112,
} = require('./Utils/JS');
const {
	freezeTime,
	increaseTime,
} = require('./Utils/Ethereum');

const oneMantissa = (new BN(10)).pow(new BN(18));
const SECONDS_IN_YEAR = 3600 * 24 * 365;
const SECONDS_IN_DAY = 3600 * 24;

function slightlyIncrease(bn) {
	return bn.mul( bnMantissa(1.00001) ).div( oneMantissa );
}
function slightlyDecrease(bn) {
	return bn.mul( oneMantissa ).div( bnMantissa(1.00001) );
}

const MockERC20 = artifacts.require('MockERC20');
const MockUniswapV2Factory = artifacts.require('MockUniswapV2Factory');
const MockUniswapV2Pair = artifacts.require('MockUniswapV2Pair');
const MockOracle = artifacts.require('MockOracle');
const BDeployer = artifacts.require('BDeployer');
const CDeployer = artifacts.require('CDeployer');
const Factory = artifacts.require('Factory');
const Collateral = artifacts.require('Collateral');
const Borrowable = artifacts.require('Borrowable');

contract('Highlevel', function (accounts) {
	const root = accounts[0];
	const user = accounts[1];
	const reservesAdmin = accounts[2];		
	const borrower = accounts[3];		
	const lender = accounts[4];		
	const liquidator = accounts[5];		
	const reservesManager = accounts[6];		

	let factory, uniswapV2Pair, token0, token1, collateral, borrowable0, borrowable1;
	
	const lendAmount0 = bnMantissa(20);
	const lendAmount1 = bnMantissa(1000);
	const collateralAmount = bnMantissa(300);
	const price0A = 5;
	const price1A = 0.2;	
	const borrowAmount0 = bnMantissa(20);
	const borrowAmount1 = bnMantissa(500);
	const expectedBorrowAmont0A = bnMantissa(20.02);
	const expectedBorrowAmont1A = bnMantissa(500.5);
	const expectedAccountLiquidityA = bnMantissa(69.5560);
	const expectedBorrowRate0A = bnMantissa(0.1 * 5 / SECONDS_IN_YEAR);
	const expectedBorrowRate1A = bnMantissa(0.07142857 / SECONDS_IN_YEAR);
	const timeElapsed = 1000000; //11.57 days 
	const expectedBorrowAmont0B = bnMantissa(20.337414);
	const expectedBorrowAmont1B = bnMantissa(501.63362);
	const expectedAccountLiquidityB = bnMantissa(66.79709);
	const expectedBorrowRate0B = bnMantissa(0.3314814 * 5 / SECONDS_IN_YEAR);
	const expectedBorrowRate1B = bnMantissa(0.05971332 / SECONDS_IN_YEAR);
	const price0B = 7.645966;
	const price1B = 0.13078792;
	const expectedAccountLiquidityC = bnMantissa(1.14593614);
	const price0C = 7.874008;
	const price1C = 0.1270001;
	const expectedAccountShortfallD = bnMantissa(5.230578);
	const liquidatedAmount = bnMantissa(166.54244);
	const expectedLenderProfit0 = bnMantissa(0.303672);
	const expectedProtocolProfit0 = bnMantissa(0.0337414);
	
	
	before(async () => {
		await freezeTime();
	});

	it('deploy factory', async () => {
		factory = await makeFactory({reservesAdmin});
		await factory._setReservesManager(reservesManager, {from: reservesAdmin});
	});

	it('deploy lending pool', async () => {
		uniswapV2Pair = await makeUniswapV2Pair({withFactory: true, uniswapV2Factory: factory.obj.uniswapV2Factory});
		token0 = uniswapV2Pair.obj.token0;
		token1 = uniswapV2Pair.obj.token1;
		const collateralAddress = await factory.createCollateral.call(uniswapV2Pair.address);
		const borrowable0Address = await factory.createBorrowable0.call(uniswapV2Pair.address);
		const borrowable1Address = await factory.createBorrowable1.call(uniswapV2Pair.address);
		const receiptCollateral = await factory.createCollateral(uniswapV2Pair.address);
		const receiptBorrowable0 = await factory.createBorrowable0(uniswapV2Pair.address);
		const receiptBorrowable1 = await factory.createBorrowable1(uniswapV2Pair.address);
		const receiptInitialize = await factory.initializeLendingPool(uniswapV2Pair.address);
		collateral = await Collateral.at(collateralAddress);
		borrowable0 = await Borrowable.at(borrowable0Address);
		borrowable1 = await Borrowable.at(borrowable1Address);
		await token0.mint(lender, lendAmount0);
		await token1.mint(lender, lendAmount1);
		await uniswapV2Pair.mint(borrower, collateralAmount);
		await factory.obj.simpleUniswapOracle.setPrice(uniswapV2Pair.address, uq112(price0A / price1A));
		await uniswapV2Pair.setReserves(bnMantissa(price1A * 1000), bnMantissa(price0A * 1000));
		await uniswapV2Pair.setTotalSupply(bnMantissa(2000));
		//console.log(receiptCollateral.receipt.gasUsed + ' createCollateral');
		//console.log(receiptBorrowable0.receipt.gasUsed + ' createBorrowable0');
		//console.log(receiptBorrowable1.receipt.gasUsed + ' createBorrowable1');
		//console.log(receiptInitialize.receipt.gasUsed + ' initialize');
	});
	
	it('settings sanity check', async () => {
		//For Highlevel tests to pass, the lending pool should have these default settings
		expectAlmostEqualMantissa(await collateral.exchangeRate.call(), oneMantissa);
		expectAlmostEqualMantissa(await collateral.liquidationIncentive(), bnMantissa(1.04));
		expectAlmostEqualMantissa(await collateral.safetyMarginSqrt(), bnMantissa(Math.sqrt(2.5)));
		expectAlmostEqualMantissa(await borrowable0.exchangeRate.call(), oneMantissa);
		expectAlmostEqualMantissa(await borrowable0.BORROW_FEE(), oneMantissa.div(new BN(1000)));
		expectAlmostEqualMantissa(await borrowable0.kinkUtilizationRate(), bnMantissa(0.7));
		expectAlmostEqualMantissa(await borrowable0.kinkBorrowRate(), bnMantissa(0.1 / SECONDS_IN_YEAR));
		expectAlmostEqualMantissa(await borrowable0.reserveFactor(), bnMantissa(0.1));
		expectEqual(await borrowable0.KINK_MULTIPLIER(), 5);
		expectAlmostEqualMantissa(await borrowable0.adjustSpeed(), bnMantissa(0.05 / SECONDS_IN_DAY));
	});
	
	it('lend', async () => {
		await token0.transfer(borrowable0.address, lendAmount0, {from: lender});
		const receiptMintBorrowable = await borrowable0.mint(lender);
		await token1.transfer(borrowable1.address, lendAmount1, {from: lender});
		await borrowable1.mint(lender);
		expectAlmostEqualMantissa(await borrowable0.totalSupply(), lendAmount0);
		expectAlmostEqualMantissa(await borrowable0.totalBalance(), lendAmount0);
		expectAlmostEqualMantissa(await borrowable0.balanceOf(lender), lendAmount0);
		expectAlmostEqualMantissa(await borrowable1.totalSupply(), lendAmount1);
		expectAlmostEqualMantissa(await borrowable1.totalBalance(), lendAmount1);
		expectAlmostEqualMantissa(await borrowable1.balanceOf(lender), lendAmount1);
		//console.log(receiptMintBorrowable.receipt.gasUsed + ' mintBorrowable');
	});
	
	it('deposit collateral', async () => {
		await uniswapV2Pair.transfer(collateral.address, collateralAmount, {from: borrower});
		const receiptMintCollateral = await collateral.mint(borrower);
		expectAlmostEqualMantissa(await collateral.totalSupply(), collateralAmount);
		expectAlmostEqualMantissa(await collateral.totalBalance(), collateralAmount);
		expectAlmostEqualMantissa(await collateral.balanceOf(borrower), collateralAmount);
		const {liquidity} = await collateral.accountLiquidity.call(borrower);
		expectAlmostEqualMantissa(liquidity, collateralAmount);
		//console.log(receiptMintCollateral.receipt.gasUsed + ' mintCollateral');
	});
	
	it('borrow token0 succeeds', async () => {
		const receiptBorrow0 = await borrowable0.borrow(borrower, borrower, borrowAmount0, '0x', {from: borrower});
		expectAlmostEqualMantissa(await borrowable0.totalSupply(), lendAmount0);
		expectAlmostEqualMantissa(await borrowable0.totalBalance(), lendAmount0.sub(borrowAmount0));
		expectAlmostEqualMantissa(await borrowable0.borrowBalance(borrower), expectedBorrowAmont0A);
		expectAlmostEqualMantissa(await token0.balanceOf(borrower), borrowAmount0);
		//console.log(receiptBorrow0.receipt.gasUsed + ' borrow0');
	});
	
	it('borrow token1 fails', async () => {
		await expectRevert(
			borrowable1.borrow(borrower, borrower, lendAmount1, '0x', {from: borrower}), 
			"Impermax: INSUFFICIENT_LIQUIDITY"
		);
	});
	
	it('borrow token1 succeeds', async () => {
		const receiptBorrow1 = await borrowable1.borrow(borrower, borrower, borrowAmount1, '0x', {from: borrower});
		expectAlmostEqualMantissa(await borrowable1.totalSupply(), lendAmount1);
		expectAlmostEqualMantissa(await borrowable1.totalBalance(), lendAmount1.sub(borrowAmount1));
		expectAlmostEqualMantissa(await borrowable1.borrowBalance(borrower), expectedBorrowAmont1A);
		expectAlmostEqualMantissa(await token1.balanceOf(borrower), borrowAmount1);
		//console.log(receiptBorrow1.receipt.gasUsed + ' borrow1');
	});
	
	it('check account liquidity', async () => {
		const {liquidity} = await collateral.accountLiquidity.call(borrower);
		expectAlmostEqualMantissa(liquidity, expectedAccountLiquidityA);
	});
	
	it('check borrow rate', async () => {
		expectAlmostEqualMantissa(await borrowable0.borrowRate(), expectedBorrowRate0A);
		expectAlmostEqualMantissa(await borrowable1.borrowRate(), expectedBorrowRate1A);
	});
	
	it('phase B: check borrow amount', async () => {
		await increaseTime(timeElapsed);
		const receiptSync = await borrowable0.sync();
		await borrowable1.sync();
		expectAlmostEqualMantissa(await borrowable0.borrowBalance(borrower), expectedBorrowAmont0B);
		expectAlmostEqualMantissa(await borrowable1.borrowBalance(borrower), expectedBorrowAmont1B);
		//console.log(receiptSync.receipt.gasUsed + ' sync');
	});
	
	it('check account liquidity', async () => {
		const {liquidity} = await collateral.accountLiquidity.call(borrower);
		expectAlmostEqualMantissa(liquidity, expectedAccountLiquidityB);
	});
	
	it('check borrow rate', async () => {
		expectAlmostEqualMantissa(await borrowable0.borrowRate(), expectedBorrowRate0B);
		expectAlmostEqualMantissa(await borrowable1.borrowRate(), expectedBorrowRate1B);
	});
	
	it('liquidation fail', async () => {
		await factory.obj.simpleUniswapOracle.setPrice(uniswapV2Pair.address, uq112(price0B / price1B));
		const {liquidity, shortfall} = await collateral.accountLiquidity.call(borrower);
		expectAlmostEqualMantissa(liquidity, expectedAccountLiquidityC);
		await expectRevert(borrowable0.liquidate(borrower, liquidator), 'Impermax: INSUFFICIENT_SHORTFALL');
	});
	
	it('liquidate token0', async () => {
		await factory.obj.simpleUniswapOracle.setPrice(uniswapV2Pair.address, uq112(price0C / price1C));
		const {liquidity, shortfall} = await collateral.accountLiquidity.call(borrower);
		expectAlmostEqualMantissa(shortfall, expectedAccountShortfallD);
		const currentBorrowAmount0 = (await borrowable0.borrowBalance(borrower));
		await token0.mint(liquidator, currentBorrowAmount0);
		await token0.transfer(borrowable0.address, currentBorrowAmount0, {from: liquidator});
		const receiptLiquidate = await borrowable0.liquidate(borrower, liquidator);
		expect(await borrowable0.borrowBalance(borrower) / 1e18).to.lt(0.01);
		expectAlmostEqualMantissa(await collateral.balanceOf(liquidator), liquidatedAmount);
		expectAlmostEqualMantissa(await collateral.balanceOf(borrower), collateralAmount.sub(liquidatedAmount));
		//console.log(receiptLiquidate.receipt.gasUsed + ' liquidate');
	});
	
	it('redeem token0', async () => {
		const lenderTokens = await borrowable0.balanceOf(lender);
		await borrowable0.transfer(borrowable0.address, lenderTokens, {from: lender});
		const receiptRedeem = await borrowable0.redeem(lender);
		expectAlmostEqualMantissa(await token0.balanceOf(lender), lendAmount0.add(expectedLenderProfit0));
		const reservesManagerTokens = await borrowable0.balanceOf(reservesManager);
		const reservesManagerAmount = (await borrowable0.exchangeRate.call()).mul(reservesManagerTokens).div(oneMantissa);
		expectAlmostEqualMantissa(reservesManagerAmount, expectedProtocolProfit0);
		//console.log(receiptRedeem.receipt.gasUsed + ' redeem');
	});
});