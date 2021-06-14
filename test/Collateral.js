const {
	Borrowable,
	Collateral,
	TarotCallee,
	ReentrantCallee,
	Recipient,
	makeFactory,
	makeUniswapV2Pair,
} = require('./Utils/Tarot');
const {
	expectAlmostEqualMantissa,
	expectRevert,
	expectEvent,
	expectEqual,
	bnMantissa,
	uq112,
	BN,
} = require('./Utils/JS');
const {
	address,
	encode,
} = require('./Utils/Ethereum');

const oneMantissa = (new BN(10)).pow(new BN(18));
const SAFETY_MARGIN_MIN = bnMantissa(Math.sqrt(1.5));
const SAFETY_MARGIN_TEST = bnMantissa(Math.sqrt(1.75));
const SAFETY_MARGIN_MAX = bnMantissa(Math.sqrt(2.5));
const LIQUIDATION_INCENTIVE_MIN = bnMantissa(1.01);
const LIQUIDATION_INCENTIVE_TEST = bnMantissa(1.03);
const LIQUIDATION_INCENTIVE_MAX = bnMantissa(1.05);

const TEST_AMOUNT = oneMantissa.mul(new BN(200));
const MAX_UINT_256 = (new BN(2)).pow(new BN(256)).sub(new BN(1));

function slightlyIncrease(bn) {
	return bn.mul( bnMantissa(1.00001) ).div( oneMantissa );
}
function slightlyDecrease(bn) {
	return bn.mul( oneMantissa ).div( bnMantissa(1.00001) );
}

contract('Collateral', function (accounts) {
	let root = accounts[0];
	let user = accounts[1];
	let admin = accounts[2];		
	let borrower = accounts[3];		
	let liquidator = accounts[4];		
	let factory;
		
	before(async () => {
		factory = await makeFactory({admin});
	});

	describe('getPrices', () => {
		let collateral;
		let underlying;
		
		before(async () => {
			collateral = await Collateral.new();
			underlying = await makeUniswapV2Pair();
			await collateral.setPriceOracle(factory.obj.tarotPriceOracle.address);
			await collateral.setUnderlyingHarness(underlying.address);
		});
		
		[
			{priceOracle: 4.67, priceNow: 4.67, totalSupply: 1000, currentReserve0: 2000},
			{priceOracle: 0.03489, priceNow: 0.03965, totalSupply: 1000, currentReserve0: 2000},
			{priceOracle: 2384574567, priceNow: 4584574567, totalSupply: 1000000, currentReserve0: 2},
			{priceOracle: 0.0000004834, priceNow: 0.0000002134, totalSupply: 10000, currentReserve0: 3489465},
		].forEach((testCase) => {
			it(`getPrices for ${JSON.stringify(testCase)}`, async () => {
				const {priceOracle, priceNow, totalSupply, currentReserve0} = testCase;
				const currentReserve1 = currentReserve0 * priceNow;
				const adjustement = Math.sqrt(priceOracle/priceNow);
				const adjustedReserve0 = currentReserve0 / adjustement;
				const adjustedReserve1 = currentReserve1 * adjustement;
				expectAlmostEqualMantissa(bnMantissa(adjustedReserve1 / adjustedReserve0), bnMantissa(priceOracle));
				
				await factory.obj.tarotPriceOracle.setPrice(underlying.address, uq112(priceOracle));
				await underlying.setTotalSupply(bnMantissa(totalSupply));
				await underlying.setReserves(bnMantissa(currentReserve0), bnMantissa(currentReserve1));
				const {price0, price1} = await collateral.getPrices.call();
				expectAlmostEqualMantissa(price0.mul(oneMantissa).div(price1), bnMantissa(priceOracle));
				expectAlmostEqualMantissa(price0, bnMantissa(totalSupply / adjustedReserve0 / 2));
				expectAlmostEqualMantissa(price1, bnMantissa(totalSupply / adjustedReserve1 / 2));				
			});
		});
		
		it(`fail if price(0|1) <= 100`, async () => {
			priceUQ112 = "1038000000000000000000000000000000000000000000000000000000000000000"; //2e32
			reserve0 = "1";
			reserve1 = "200000000000000000000000000000000";
			totalSupply = "14142000000000000";
			await factory.obj.tarotPriceOracle.setPrice(underlying.address, priceUQ112);
			await underlying.setTotalSupply(totalSupply);
			await underlying.setReserves(reserve0, reserve1);
			await expectRevert(collateral.getPrices(), 'Tarot: PRICE_CALCULATION_ERROR');
			
			priceUQ112 = "26"; //0.5e-32
			reserve0 = "200000000000000000000000000000000";
			reserve1 = "1";
			totalSupply = "14142000000000000";
			await factory.obj.tarotPriceOracle.setPrice(underlying.address, priceUQ112);
			await underlying.setTotalSupply(totalSupply);
			await underlying.setReserves(reserve0, reserve1);
			await expectRevert(collateral.getPrices(), 'Tarot: PRICE_CALCULATION_ERROR');
			
			priceUQ112 = uq112(1); //1
			reserve0 = "14142000000000000";
			reserve1 = "14142000000000000";
			totalSupply = "1";
			await factory.obj.tarotPriceOracle.setPrice(underlying.address, priceUQ112);
			await underlying.setTotalSupply(totalSupply);
			await underlying.setReserves(reserve0, reserve1);
			await expectRevert(collateral.getPrices(), 'Tarot: PRICE_CALCULATION_ERROR');			
		});
	});
	
	[
		{safetyMargin: 2.50, liquidationIncentive: 1.01, amounts: [280, 100, 100], prices: [1, 1]},
		{safetyMargin: 2.25, liquidationIncentive: 1.02, amounts: [3060, 0, 2000], prices: [1, 1]},
		{safetyMargin: 2.00, liquidationIncentive: 1.03, amounts: [1000, 111, 1.546], prices: [11.3, 0.56]},
		{safetyMargin: 1.75, liquidationIncentive: 1.04, amounts: [11.3, 175.6, 200], prices: [0.0059, 0.034]},
		{safetyMargin: 1.50, liquidationIncentive: 1.05, amounts: [2154546, 1, 1.12e12], prices: [1154546, 0.0000008661]},
	].forEach((testCase) => {
		describe(`Collateral tests for ${JSON.stringify(testCase)}`, () => {
			let collateral;
			let borrowable0;
			let borrowable1;
			const exchangeRate = 2;
			
			const {safetyMargin, liquidationIncentive, amounts, prices} = testCase;
			const collateralValue = amounts[0];
			
			//Case A: price0 / price1 increase by safetyMargin
			const price0FinalA = prices[0] * Math.sqrt(safetyMargin);
			const price1FinalA = prices[1] / Math.sqrt(safetyMargin);
			const collateralNeededA = (price0FinalA * amounts[1] + price1FinalA * amounts[2]) * liquidationIncentive;
			const maxBorrowable0A = (collateralValue / liquidationIncentive - price1FinalA * amounts[2]) / price0FinalA;
			const maxBorrowable1A = (collateralValue / liquidationIncentive - price0FinalA * amounts[1]) / price1FinalA;
			
			//Case B: price0 / price1 decrease by safetyMargin
			const price0FinalB = prices[0] / Math.sqrt(safetyMargin);
			const price1FinalB = prices[1] * Math.sqrt(safetyMargin);
			const collateralNeededB = (price0FinalB * amounts[1] + price1FinalB * amounts[2]) * liquidationIncentive;
			const maxBorrowable0B = (collateralValue / liquidationIncentive - price1FinalB * amounts[2]) / price0FinalB;
			const maxBorrowable1B = (collateralValue / liquidationIncentive - price0FinalB * amounts[1]) / price1FinalB;
			
			//Calculate liquidity offchain
			const collateralNeeded = (collateralNeededA > collateralNeededB) ? collateralNeededA : collateralNeededB;
			const maxBorrowable0 = (maxBorrowable0A < maxBorrowable0B) ? maxBorrowable0A : maxBorrowable0B;
			const maxBorrowable1 = (maxBorrowable1A < maxBorrowable1B) ? maxBorrowable1A : maxBorrowable1B;
			const collateralBalance = collateralValue - collateralNeeded;
			const expectedLiquidity = (collateralBalance > 0) ? collateralBalance : 0;
			const expectedShortfall = (collateralBalance < 0) ? -collateralBalance : 0;
			
			before(async () => {
				collateral = await Collateral.new();
				borrowable0 = await Borrowable.new();
				borrowable1 = await Borrowable.new();
				await collateral.setFactoryHarness(factory.address);				
				await collateral.setExchangeRateHarness(bnMantissa(exchangeRate));				
				await collateral.setBorrowable0Harness(borrowable0.address);				
				await collateral.setBorrowable1Harness(borrowable1.address);
				
				await collateral._setSafetyMarginSqrt(bnMantissa(Math.sqrt(safetyMargin)), {from: admin});
				await collateral._setLiquidationIncentive(bnMantissa(liquidationIncentive), {from: admin});
				await collateral.setPricesHarness(bnMantissa(prices[0]), bnMantissa(prices[1]));
			});
			
			beforeEach(async () => {
				const tokenBalance = collateralValue / exchangeRate;
				await collateral.setBalanceHarness(user, bnMantissa(tokenBalance));
				await borrowable0.setBorrowBalanceHarness(user, bnMantissa(amounts[1]));
				await borrowable1.setBorrowBalanceHarness(user, bnMantissa(amounts[2]));
			});

			it(`calculateLiquidity`, async () => {
				const {liquidity, shortfall} = await collateral.calculateLiquidity.call(
					bnMantissa(amounts[0]), bnMantissa(amounts[1]), bnMantissa(amounts[2])
				);
				expectAlmostEqualMantissa(liquidity, bnMantissa(expectedLiquidity));
				expectAlmostEqualMantissa(shortfall, bnMantissa(expectedShortfall));
			});

			it(`transfer:succeed`, async () => {
				if (expectedShortfall > 0) return;
				const transferAmount = slightlyDecrease(bnMantissa(expectedLiquidity / exchangeRate));
				expect(await collateral.tokensUnlocked.call(user, transferAmount)).to.eq(true);
				await collateral.transfer(address(0), transferAmount, {from: user});
			});

			it(`transfer:fail`, async () => {
				const transferAmount = slightlyIncrease(bnMantissa(expectedLiquidity / exchangeRate + 0.0000001));
				expect(await collateral.tokensUnlocked.call(user, transferAmount)).to.eq(false);
				await expectRevert(collateral.transfer(address(0), transferAmount, {from: user}), 'Tarot: INSUFFICIENT_LIQUIDITY');
			});

			it(`accountLiquidity`, async () => {
				const {liquidity, shortfall} = await collateral.accountLiquidity.call(user);
				expectAlmostEqualMantissa(liquidity, bnMantissa(expectedLiquidity));
				expectAlmostEqualMantissa(shortfall, bnMantissa(expectedShortfall));
			});

			it(`accountLiquidityAmounts`, async () => {
				const {liquidity, shortfall} = await collateral.accountLiquidityAmounts.call(user, bnMantissa(amounts[1]), bnMantissa(amounts[2]));
				expectAlmostEqualMantissa(liquidity, bnMantissa(expectedLiquidity));
				expectAlmostEqualMantissa(shortfall, bnMantissa(expectedShortfall));
			});

			it(`canBorrow`, async () => {
				const r = expectedShortfall == 0;
				expect(await collateral.canBorrow.call(user, borrowable0.address, bnMantissa(amounts[1]))).to.eq(r);
				expect(await collateral.canBorrow.call(user, borrowable1.address, bnMantissa(amounts[2]))).to.eq(r);
				if (maxBorrowable0 < 0) {
					expect(await collateral.canBorrow.call(user, borrowable0.address, "0")).to.eq(false);
				} else if (maxBorrowable0 == 0) {
					expect(await collateral.canBorrow.call(user, borrowable0.address, "0")).to.eq(true);
				} else {
					const succeedAmount = slightlyDecrease( bnMantissa(maxBorrowable0) );
					const failAmount = slightlyIncrease( bnMantissa(maxBorrowable0) );
					expect(await collateral.canBorrow.call(user, borrowable0.address, succeedAmount)).to.eq(true);
					expect(await collateral.canBorrow.call(user, borrowable0.address, failAmount)).to.eq(false);
				}
				if (maxBorrowable1 < 0) {
					expect(await collateral.canBorrow.call(user, borrowable1.address, "0")).to.eq(false);
				} else if (maxBorrowable1 == 0) {
					expect(await collateral.canBorrow.call(user, borrowable1.address, "0")).to.eq(true);
				} else {
					const succeedAmount = slightlyDecrease( bnMantissa(maxBorrowable1) );
					const failAmount = slightlyIncrease( bnMantissa(maxBorrowable1) );
					expect(await collateral.canBorrow.call(user, borrowable1.address, succeedAmount)).to.eq(true);
					expect(await collateral.canBorrow.call(user, borrowable1.address, failAmount)).to.eq(false);
				}
			});
		});
	});
	
	describe('seize', () => {
		let collateral;
		let borrowable0;
		let borrowable1;
		const exchangeRate = 2;
		const liquidationIncentive = 1.04;
		const price0 = 2;
		const price1 = 0.5;
		const collateralTokens = 100;
		const maxRepay0 = (collateralTokens * exchangeRate) / price0 / liquidationIncentive;
		const maxRepay1 = (collateralTokens * exchangeRate) / price1 / liquidationIncentive;
		
		before(async () => {
			collateral = await Collateral.new();
			borrowable0 = await Borrowable.new();
			borrowable1 = await Borrowable.new();
			await collateral.setFactoryHarness(factory.address);
			await collateral.setBorrowable0Harness(borrowable0.address);				
			await collateral.setBorrowable1Harness(borrowable1.address);
			await collateral.setExchangeRateHarness(bnMantissa(exchangeRate));				
			await collateral._setLiquidationIncentive(bnMantissa(liquidationIncentive), {from: admin});
			await collateral.setPricesHarness(bnMantissa(price0), bnMantissa(price1));
		});
		
		it(`fail if msg.sender is not borrowable`, async () => {
			await expectRevert(collateral.seize(address(0), address(0), '0'), "Tarot: UNAUTHORIZED");
		});
		
		it(`fail if shortfall is insufficient`, async () => {
			await collateral.setAccountLiquidityHarness(borrower, '0', '0');
			await expectRevert(
				borrowable0.seizeHarness(collateral.address, liquidator, borrower, '0'), 
				"Tarot: INSUFFICIENT_SHORTFALL"
			);
			await expectRevert(
				borrowable1.seizeHarness(collateral.address, liquidator, borrower, '0'), 
				"Tarot: INSUFFICIENT_SHORTFALL"
			);
		});
		
		it(`fail if repayAmount is too high`, async () => {
			await collateral.setAccountLiquidityHarness(borrower, '0', '1');
			await collateral.setBalanceHarness(borrower, bnMantissa(collateralTokens));
			await expectRevert(
				borrowable0.seizeHarness(collateral.address, liquidator, borrower, slightlyIncrease(bnMantissa(maxRepay0))), 
				"Tarot: LIQUIDATING_TOO_MUCH"
			);
			await expectRevert(
				borrowable1.seizeHarness(collateral.address, liquidator, borrower, slightlyIncrease(bnMantissa(maxRepay1))), 
				"Tarot: LIQUIDATING_TOO_MUCH"
			);
		});
		
		it(`seize succeed`, async () => {
			await collateral.setAccountLiquidityHarness(borrower, '0', '1');
			const expectedLiquidity = slightlyDecrease(bnMantissa(collateralTokens));
			
			//Repay with borrowable0
			await collateral.setBalanceHarness(liquidator, '0');
			await collateral.setBalanceHarness(borrower, bnMantissa(collateralTokens));
			const repayAmount0 = slightlyDecrease(bnMantissa(maxRepay0));
			const receipt0 = await borrowable0.seizeHarness(collateral.address, liquidator, borrower, repayAmount0);
			expectEvent(receipt0, 'Transfer', {
				'from': borrower,
				'to': liquidator,
			});
			expectAlmostEqualMantissa(await collateral.balanceOf(liquidator), expectedLiquidity);
			
			//Repay with borrowable1
			await collateral.setBalanceHarness(liquidator, '0');
			await collateral.setBalanceHarness(borrower, bnMantissa(collateralTokens));
			const repayAmount1 = slightlyDecrease(bnMantissa(maxRepay1));
			const receipt1 = await borrowable1.seizeHarness(collateral.address, liquidator, borrower, repayAmount1);
			expectEvent(receipt1, 'Transfer', {
				'from': borrower,
				'to': liquidator,
			});
			expectAlmostEqualMantissa(await collateral.balanceOf(liquidator), expectedLiquidity);
		});
	});

	describe('flash redeem', () => {
		let collateral;
		let underlying;
		let callee;
		let recipient;
		
		const exchangeRate = 2;
		const redeemAmount = TEST_AMOUNT;
		const redeemTokens = redeemAmount.div(new BN(exchangeRate)).add(new BN(1));
		const collateralBalancePrior = TEST_AMOUNT.mul(new BN(2));
		const totalSupplyPrior = collateralBalancePrior.div(new BN(exchangeRate));
		
		before(async () => {
			collateral = await Collateral.new();
			underlying = await makeUniswapV2Pair();
			await collateral.setUnderlyingHarness(underlying.address);
			await collateral.unlockTokensTransfer();
			recipient = await Recipient.new();
			callee = (await TarotCallee.new(recipient.address, collateral.address)).address;
		});
		
		beforeEach(async () => {
			await collateral.setBalanceHarness(user, redeemTokens);
			await collateral.setBalanceHarness(recipient.address, redeemTokens);
			await collateral.setBalanceHarness(collateral.address, '0');
			await collateral.setTotalSupply(totalSupplyPrior);
			await underlying.setBalanceHarness(collateral.address, collateralBalancePrior);
			await underlying.setBalanceHarness(user, '0');
			await underlying.setBalanceHarness(recipient.address, '0');
			await collateral.sync();
		});
		
		it('redeem paying before', async () => {
			const collateralBalance = collateralBalancePrior.sub(redeemAmount);
			await collateral.transfer(collateral.address, redeemTokens, {from: user});
			const receipt = await collateral.flashRedeem(user, redeemAmount, '0x');
			expectEvent(receipt, 'Transfer', {
				from: collateral.address,
				to: address(0),
				value: redeemTokens,
			});
			expectEvent(receipt, 'Transfer', {
				from: collateral.address,
				to: user,
				value: redeemAmount,
			});
			expectEvent(receipt, 'Sync', {
				totalBalance: collateralBalance,
			});
			expectEvent(receipt, 'Redeem', {
				sender: root,
				redeemer: user,
				redeemAmount: redeemAmount,
				redeemTokens: redeemTokens,
			});
			
			expectEqual(await collateral.totalSupply(), totalSupplyPrior.sub(redeemTokens));
			expectEqual(await collateral.balanceOf(user), 0);
			expectEqual(await underlying.balanceOf(collateral.address), collateralBalance);
			expectEqual(await collateral.totalBalance(), collateralBalance);
			expectEqual(await underlying.balanceOf(user), redeemAmount);
			expectEqual(await collateral.exchangeRate.call(), oneMantissa.mul(new BN(exchangeRate)));
		});
		
		it('redeem fails if redeemTokens is not enough', async () => {
			await collateral.transfer(collateral.address, redeemTokens.sub(new BN(1)), {from: user});
			await expectRevert(collateral.flashRedeem(user, redeemAmount, '0x'), 'Tarot: INSUFFICIENT_REDEEM_TOKENS');
		});
		
		it('redeemTokens can be more than needed', async () => {
			const collateralBalance = collateralBalancePrior.sub(redeemAmount.div(new BN(2)));
			await collateral.transfer(collateral.address, redeemTokens, {from: user});
			const receipt = await collateral.flashRedeem(user, redeemAmount.div(new BN(2)), '0x');
			expectEvent(receipt, 'Transfer', {
				from: collateral.address,
				to: address(0),
				value: redeemTokens,
			});
			expectEvent(receipt, 'Transfer', {
				from: collateral.address,
				to: user,
				value: redeemAmount.div(new BN(2)),
			});
			expectEvent(receipt, 'Sync', {
				totalBalance: collateralBalance,
			});
			expectEvent(receipt, 'Redeem', {
				sender: root,
				redeemer: user,
				redeemAmount: redeemAmount.div(new BN(2)),
				redeemTokens: redeemTokens,
			});
			
			expectEqual(await collateral.totalSupply(), totalSupplyPrior.sub(redeemTokens));
			expectEqual(await collateral.balanceOf(user), 0);
			expectEqual(await underlying.balanceOf(collateral.address), collateralBalance);
			expectEqual(await collateral.totalBalance(), collateralBalance);
			expectEqual(await underlying.balanceOf(user), redeemAmount.div(new BN(2)));
		});
		
		it('redeem fails if redeemAmount exceeds cash', async () => {
			await expectRevert(
				collateral.flashRedeem(user, collateralBalancePrior.add(new BN(1)), '0x'), 
				'Tarot: INSUFFICIENT_CASH'
			);
		});
		
		it('flash redeem', async () => {
			const collateralBalance = collateralBalancePrior.sub(redeemAmount);
			const receipt = await collateral.flashRedeem(callee, redeemAmount, '0x1');
			
			expectEqual(await collateral.totalSupply(), totalSupplyPrior.sub(redeemTokens));
			expectEqual(await collateral.balanceOf(callee), 0);
			expectEqual(await underlying.balanceOf(collateral.address), collateralBalance);
			expectEqual(await collateral.totalBalance(), collateralBalance);
			expectEqual(await underlying.balanceOf(callee), redeemAmount);
			expectEqual(await collateral.exchangeRate.call(), oneMantissa.mul(new BN(exchangeRate)));
		});
	});
	
	describe('reentrancy', () => {
		let collateral;
		let underlying;
		let receiver;
		before(async () => {
			collateral = await Collateral.new();
			underlying = await makeUniswapV2Pair();
			await collateral.setUnderlyingHarness(underlying.address);
			receiver = (await ReentrantCallee.new()).address;
		});
		
		it(`borrow reentrancy`, async () => {
			await expectRevert(collateral.flashRedeem(receiver, '0', encode(['uint'], [1])), 'Tarot: REENTERED');
			await expectRevert(collateral.flashRedeem(receiver, '0', encode(['uint'], [2])), 'Tarot: REENTERED');
			await expectRevert(collateral.flashRedeem(receiver, '0', encode(['uint'], [3])), 'Tarot: REENTERED');
			await expectRevert(collateral.flashRedeem(receiver, '0', encode(['uint'], [4])), 'Tarot: REENTERED');
			await expectRevert(collateral.flashRedeem(receiver, '0', encode(['uint'], [5])), 'Tarot: REENTERED');
			await expectRevert(collateral.flashRedeem(receiver, '0', encode(['uint'], [0])), 'TEST');
		});
	});
});