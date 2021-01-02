const {
	Borrowable,
	Collateral,
	ImpermaxCallee,
	ReentrantCallee,
	Recipient,
	MockBorrowTracker,
	makeFactory,
	makeUniswapV2Pair,
	makeErc20Token,
} = require('./Utils/Impermax');
const {
	expectAlmostEqualMantissa,
	expectRevert,
	expectEvent,
	bnMantissa,
	BN,
} = require('./Utils/JS');
const {
	address,
	encode,
} = require('./Utils/Ethereum');
const { keccak256, toUtf8Bytes } = require('ethers/utils');

const oneMantissa = (new BN(10)).pow(new BN(18));
const K_TRACKER = (new BN(2)).pow(new BN(128));
const INITIAL_EXCHANGE_RATE = oneMantissa;

function slightlyIncrease(bn) {
	return bn.mul( bnMantissa(1.00001) ).div( oneMantissa );
}
function slightlyDecrease(bn) {
	return bn.mul( oneMantissa ).div( bnMantissa(1.00001) );
}

contract('Borrowable', function (accounts) {
	let root = accounts[0];
	let user = accounts[1];
	let admin = accounts[2];		
	let borrower = accounts[3];		
	let receiver = accounts[4];		
	let liquidator = accounts[5];		
	let reserveManager = accounts[6];		
	
	describe('exchangeRate, borrowBalance', () => {
		let borrowable;
		let factory;
		beforeEach(async () => {
			borrowable = await Borrowable.new();			
			factory = await makeFactory({admin});
			await borrowable.setFactoryHarness(factory.address);
			await borrowable.setReserveFactor('0');
		});
			
		it(`exchangeRate`, async () => {
			await borrowable.setTotalSupply(bnMantissa(0));
			await borrowable.setTotalBalance(bnMantissa(500));
			await borrowable.setTotalBorrows(bnMantissa(500));
			expectAlmostEqualMantissa(await borrowable.exchangeRate.call(), INITIAL_EXCHANGE_RATE);
			await borrowable.setTotalSupply(bnMantissa(500));
			await borrowable.setTotalBalance(bnMantissa(0));
			await borrowable.setTotalBorrows(bnMantissa(0));
			expectAlmostEqualMantissa(await borrowable.exchangeRate.call(), INITIAL_EXCHANGE_RATE);
			await borrowable.setTotalSupply(bnMantissa(500));
			await borrowable.setTotalBalance(bnMantissa(500));
			await borrowable.setTotalBorrows(bnMantissa(500));
			expectAlmostEqualMantissa(await borrowable.exchangeRate.call(), bnMantissa(2));
			await borrowable.setTotalSupply(bnMantissa(500));
			await borrowable.setTotalBalance(bnMantissa(0));
			await borrowable.setTotalBorrows(bnMantissa(2000));
			expectAlmostEqualMantissa(await borrowable.exchangeRate.call(), bnMantissa(4));
		});
		
		it(`borrowBalance`, async () => {
			const borrowIndex = await borrowable.borrowIndex();
			expect(await borrowable.borrowBalance(borrower) * 1).to.eq(0);
			await borrowable.setBorrowBalances(borrower, bnMantissa(100), borrowIndex);
			expectAlmostEqualMantissa(await borrowable.borrowBalance(borrower), bnMantissa(100));
			await borrowable.setBorrowIndex(borrowIndex.mul(new BN(12)).div(new BN(10)));
			expectAlmostEqualMantissa(await borrowable.borrowBalance(borrower), bnMantissa(120));
		});
	});
	
	describe('borrow and repay', () => {
		let borrowable;
		let underlying;
		let collateral;
		let recipient;
		let borrowTracker;
		const BORROW_FEE = (new BN(10)).pow(new BN(15));
		const borrowAmount = oneMantissa.mul(new BN(20));
		const borrowedAmount = borrowAmount.mul(BORROW_FEE).div(oneMantissa).add(borrowAmount);
		
		async function makeBorrow(params) {
			const {
				borrowAmount,
				repayAmount,
				maxBorrowableNew,
			} = params;
			
			const borrowedAmount = borrowAmount.mul(BORROW_FEE).div(oneMantissa).add(borrowAmount);
			const initialBorrowAmount = await borrowable.borrowBalance(borrower);
			const maxBorrowable = initialBorrowAmount.add(maxBorrowableNew);
			const newBorrowAmount = initialBorrowAmount.add(borrowedAmount);
			const actualRepayAmount = repayAmount.gt(newBorrowAmount) ? newBorrowAmount : repayAmount;
			const expectedAccountBorrows = newBorrowAmount.sub(actualRepayAmount);
			const expectedReceiverBalance = borrowAmount.add(await underlying.balanceOf(receiver));
			const expectedTotalBorrows = borrowedAmount.add(await borrowable.totalBorrows()).sub(actualRepayAmount);

			//FOR DEBUG
			//console.log('borrowAmount:', borrowAmount / 1e18);
			//console.log('repayAmount:', repayAmount / 1e18);
			//console.log('maxBorrowable:', maxBorrowable / 1e18);
			//console.log('borrowedAmount:', borrowedAmount / 1e18);
			//console.log('expectedAccountBorrows:', expectedAccountBorrows / 1e18);
			//console.log('expectedReceiverBalance:', expectedReceiverBalance / 1e18);
			//console.log('expectedTotalBorrows:', expectedTotalBorrows / 1e18);
			
			await collateral.setMaxBorrowable(borrower, borrowable.address, maxBorrowable);
			await underlying.setBalanceHarness(borrowable.address, borrowAmount);
			await underlying.setBalanceHarness(recipient.address, repayAmount);
			await borrowable.sync();
			await borrowable.borrowApprove(root, borrowAmount, {from: borrower});
			expect(await borrowable.borrowAllowance(borrower, root) * 1).to.eq(borrowAmount * 1);
			const borrowAction = borrowable.borrow(borrower, receiver, borrowAmount, '0x1');
			if (maxBorrowable.lt(expectedAccountBorrows)) {
				await expectRevert(borrowAction, 'Impermax: INSUFFICIENT_LIQUIDITY');
				return false;
			}
			const receipt = await borrowAction;
			
			const borrowBalance = await borrowable.borrowBalance(borrower);
			expect(await borrowable.borrowAllowance(borrower, root) * 1).to.eq(0);
			expect(await underlying.balanceOf(borrowable.address) * 1).to.eq(repayAmount * 1);
			expect(await underlying.balanceOf(receiver) * 1).to.eq(expectedReceiverBalance * 1);
			expect(borrowBalance * 1).to.eq(expectedAccountBorrows * 1);
			expect(await borrowable.totalBorrows() * 1).to.eq(expectedTotalBorrows * 1);
			expect(await borrowable.totalBalance() * 1).to.eq(repayAmount * 1);
			expectEvent(receipt, 'Transfer', {});
			expectEvent(receipt, 'Sync', {});
			expectEvent(receipt, 'CalculateBorrowRate', {});
			expectEvent(receipt, 'Borrow', {
				'sender': root,
				'borrower': borrower,
				'receiver': receiver,
				'borrowAmount': borrowAmount,
				'repayAmount': repayAmount,
				'accountBorrowsPrior': initialBorrowAmount,
				'accountBorrows': expectedAccountBorrows,
				'totalBorrows': expectedTotalBorrows,
			});
			
			const borrowIndex = await borrowable.borrowIndex();
			expectAlmostEqualMantissa(await borrowTracker.relativeBorrow(borrower), borrowBalance.mul(K_TRACKER).div(borrowIndex));
			
			return true;
		}
		
		before(async () => {
			borrowable = await Borrowable.new();
			underlying = await makeErc20Token();
			collateral = await Collateral.new();
			recipient = await Recipient.new();
			receiver = (await ImpermaxCallee.new(recipient.address, underlying.address)).address;
			borrowTracker = await MockBorrowTracker.new();
			await borrowable.setUnderlyingHarness(underlying.address);
			await borrowable.setCollateralHarness(collateral.address);
			await borrowable.setBorrowTracker(borrowTracker.address);
			await borrowable.sync(); //avoid undesired borrowBalance growing 
		});
		
		it(`fail if cash is insufficient`, async () => {
			await underlying.setBalanceHarness(borrowable.address, '0');
			await borrowable.sync();
			await expectRevert(borrowable.borrow(borrower, receiver, '1', '0x'), 'Impermax: INSUFFICIENT_CASH');			
		});

		it(`fail if not allowed`, async () => {
			await underlying.setBalanceHarness(borrowable.address, '1');
			await borrowable.sync();
			await expectRevert(borrowable.borrow(borrower, receiver, '1', '0x'), 'Impermax: BORROW_NOT_ALLOWED');			
		});

		it(`borrow succeds with enough collateral`, async () => {
			const repayAmount = new BN(0);
			const maxBorrowableNew = borrowAmount.mul( oneMantissa.add(BORROW_FEE) ).div(oneMantissa); // TODO update in fucntion
			const result = await makeBorrow({borrowAmount, repayAmount, maxBorrowableNew});
			expect(result).to.eq(true);
		});

		it(`borrow fails without enough collateral`, async () => {
			const repayAmount = new BN(0);
			const maxBorrowableNew = borrowAmount.mul( oneMantissa.add(BORROW_FEE) ).div(oneMantissa).sub(new BN(1));
			const result = await makeBorrow({borrowAmount, repayAmount, maxBorrowableNew});
			expect(result).to.eq(false);
		});

		it(`borrow succeds without collateral if repaid`, async () => {
			const repayAmount = borrowedAmount.mul( oneMantissa ).div(oneMantissa);
			const maxBorrowableNew = new BN(0);
			const result = await makeBorrow({borrowAmount, repayAmount, maxBorrowableNew});
			expect(result).to.eq(true);
		});

		it(`borrow succeds without collateral if overly repaid`, async () => {
			const repayAmount = borrowedAmount.mul( oneMantissa.mul(new BN(12)).div(new BN(10)) ).div(oneMantissa);
			const maxBorrowableNew = new BN(0);
			const result = await makeBorrow({borrowAmount, repayAmount, maxBorrowableNew});
			expect(result).to.eq(true);
		});

		it(`borrow fails without collateral if not fully repaid`, async () => {
			const repayAmount = borrowedAmount.mul( oneMantissa.mul(new BN(999999)).div(new BN(1000000)) ).div(oneMantissa);
			const maxBorrowableNew = new BN(0);
			const result = await makeBorrow({borrowAmount, repayAmount, maxBorrowableNew});
			expect(result).to.eq(false);
		});

		it(`borrow succeds with half collateral if half repaid`, async () => {
			const repayAmount = borrowedAmount.mul( oneMantissa.div(new BN(2)) ).div(oneMantissa);
			const maxBorrowableNew = borrowAmount.mul( oneMantissa.add(BORROW_FEE) ).div(oneMantissa).div(new BN(2));
			const result = await makeBorrow({borrowAmount, repayAmount, maxBorrowableNew});
			expect(result).to.eq(true);
		});

		it(`borrow fails with half collateral if not repaid`, async () => {
			const repayAmount = borrowedAmount.mul( oneMantissa.div(new BN(2)).mul(new BN(999999)).div(new BN(1000000)) ).div(oneMantissa);
			const maxBorrowableNew = borrowAmount.mul( oneMantissa.add(BORROW_FEE) ).div(oneMantissa).div(new BN(2));
			const result = await makeBorrow({borrowAmount, repayAmount, maxBorrowableNew});
			expect(result).to.eq(false);
		});

		it(`repay succeeds`, async () => {
			const borrowAmount = new BN(0);
			const repayAmount = oneMantissa.mul(new BN(5));
			const maxBorrowableNew = new BN(0);
			const result = await makeBorrow({borrowAmount, repayAmount, maxBorrowableNew});
			expect(result).to.eq(true);
		});

		it(`no cashback if over-repaid`, async () => {
			const borrowAmount = new BN(0);
			const repayAmount = oneMantissa.mul(new BN(1000));
			const maxBorrowableNew = new BN(0);
			const result = await makeBorrow({borrowAmount, repayAmount, maxBorrowableNew});
			expect(result).to.eq(true);
		});
	});
	
	describe('liquidate', () => {
		let factory;
		let borrowable;
		let underlying;
		let collateral;
		let recipient;
		
		const exchangeRate = oneMantissa.mul(new BN(2));
		const liquidationIncentive = oneMantissa.mul(new BN(104)).div(new BN(100));
		const price = oneMantissa.mul(new BN(3));
		
		const declaredRepayAmount = oneMantissa.mul(new BN(20));
		const seizeTokens = declaredRepayAmount.mul(price).div(exchangeRate).mul(liquidationIncentive).div(oneMantissa);
		
		async function pretendHasBorrowed(borrower, amount) {
			const borrowIndex = await borrowable.borrowIndex();
			await borrowable.setTotalBorrows(amount);
			await borrowable.setBorrowBalances(borrower, amount, borrowIndex);
		}
		
		before(async () => {
			factory = await makeFactory({admin});
			borrowable = await Borrowable.new();
			underlying = await makeErc20Token();
			collateral = await Collateral.new();
			recipient = await Recipient.new();
			liquidator = (await ImpermaxCallee.new(recipient.address, underlying.address)).address;
			await borrowable.setUnderlyingHarness(underlying.address);
			await borrowable.setCollateralHarness(collateral.address);
			await borrowable.sync(); //avoid undesired borrowBalance growing 
			await collateral.setFactoryHarness(factory.address);
			await collateral.setBorrowable0Harness(borrowable.address);				
			await collateral.setExchangeRateHarness(exchangeRate);				
			await collateral._setLiquidationIncentive(liquidationIncentive, {from: admin});
			await collateral.setPricesHarness(price, '1');
		});
		
		beforeEach(async () => {
			await underlying.setBalanceHarness(borrowable.address, '0');
			await collateral.setBalanceHarness(borrower, seizeTokens);
			await borrowable.sync();
		});
		
		it(`fail if shortfall is insufficient`, async () => {
			await collateral.setAccountLiquidityHarness(borrower, '0', '0');
			await expectRevert(
				borrowable.liquidate(borrower, liquidator, declaredRepayAmount, '0x'), 
				"Impermax: INSUFFICIENT_SHORTFALL"
			);		
		});
		
		it(`fail if declaredRepayAmount is too high`, async () => {
			await collateral.setAccountLiquidityHarness(borrower, '0', '1');
			await expectRevert(
				borrowable.liquidate(borrower, liquidator, declaredRepayAmount.add(new BN(1)), '0x'), 
				"Impermax: LIQUIDATING_TOO_MUCH"
			);		
		});
		
		it(`fail if declaredRepayAmount is not enough`, async () => {
			await collateral.setAccountLiquidityHarness(borrower, '0', '1');
			await pretendHasBorrowed(borrower, declaredRepayAmount);
			await underlying.setBalanceHarness(borrowable.address, declaredRepayAmount.sub(new BN(1)));
			await expectRevert(
				borrowable.liquidate(borrower, liquidator, declaredRepayAmount, '0x'), 
				"Impermax: INSUFFICIENT_REPAY"
			);		
		});
		
		it(`fail if actualRepayAmount is not enough`, async () => {
			await collateral.setAccountLiquidityHarness(borrower, '0', '1');
			await pretendHasBorrowed(borrower, declaredRepayAmount.sub(new BN(1)));
			await underlying.setBalanceHarness(borrowable.address, declaredRepayAmount);
			await expectRevert(
				borrowable.liquidate(borrower, liquidator, declaredRepayAmount, '0x'), 
				"Impermax: INSUFFICIENT_REPAY"
			);		
		});
		
		it(`declaredRepayAmount is right`, async () => {
			await collateral.setAccountLiquidityHarness(borrower, '0', '1');
			await pretendHasBorrowed(borrower, declaredRepayAmount);
			await underlying.setBalanceHarness(borrowable.address, declaredRepayAmount);
			const actualSeizeTokens = await borrowable.liquidate.call(borrower, liquidator, declaredRepayAmount, '0x');
			const receipt = await borrowable.liquidate(borrower, liquidator, declaredRepayAmount, '0x');
			
			expect(actualSeizeTokens * 1).to.eq(seizeTokens * 1);
			expect(await borrowable.totalBorrows() * 1).to.eq(0);
			expect(await borrowable.borrowBalance(borrower) * 1).to.eq(0);
			expect(await borrowable.totalBalance() * 1).to.eq(declaredRepayAmount * 1);
			expectEvent(receipt, 'Liquidate', {
				sender: root,
				borrower: borrower,
				liquidator: liquidator,
				declaredRepayAmount: declaredRepayAmount,
				repayAmount: declaredRepayAmount,
				seizeTokens: seizeTokens,
				accountBorrowsPrior: declaredRepayAmount,
				accountBorrows: '0',
				totalBorrows: '0',
			});
		});
		
		it(`repayAmount may be higher than declaredRepayAmount`, async () => {
			const accountBorrowsPrior = declaredRepayAmount.mul(new BN(3));
			const repayAmount = declaredRepayAmount.mul(new BN(2));
			await collateral.setAccountLiquidityHarness(borrower, '0', '1');
			await pretendHasBorrowed(borrower, accountBorrowsPrior);
			await underlying.setBalanceHarness(borrowable.address, repayAmount);
			const receipt = await borrowable.liquidate(borrower, liquidator, declaredRepayAmount, '0x');
			const accountBorrows = accountBorrowsPrior.sub(repayAmount);
			
			expect(await borrowable.totalBorrows() * 1).to.eq(accountBorrows * 1);
			expect(await borrowable.borrowBalance(borrower) * 1).to.eq(accountBorrows * 1);
			expect(await borrowable.totalBalance() * 1).to.eq(repayAmount * 1);
			expectEvent(receipt, 'Liquidate', {
				sender: root,
				borrower: borrower,
				liquidator: liquidator,
				declaredRepayAmount: declaredRepayAmount,
				repayAmount: repayAmount,
				seizeTokens: seizeTokens,
				accountBorrowsPrior: accountBorrowsPrior,
				accountBorrows: accountBorrows,
				totalBorrows: accountBorrows,
			});
		});
		
		it(`actualRepayAmount cannot be higher than the borrowed amount`, async () => {
			const accountBorrowsPrior = declaredRepayAmount.mul(new BN(2));
			const repayAmount = declaredRepayAmount.mul(new BN(3));
			await collateral.setAccountLiquidityHarness(borrower, '0', '1');
			await pretendHasBorrowed(borrower, accountBorrowsPrior);
			await underlying.setBalanceHarness(borrowable.address, repayAmount);
			const receipt = await borrowable.liquidate(borrower, liquidator, declaredRepayAmount, '0x');
			
			expect(await borrowable.totalBorrows() * 1).to.eq(0);
			expect(await borrowable.borrowBalance(borrower) * 1).to.eq(0);
			expect(await borrowable.totalBalance() * 1).to.eq(repayAmount * 1);
			expectEvent(receipt, 'Liquidate', {
				sender: root,
				borrower: borrower,
				liquidator: liquidator,
				declaredRepayAmount: declaredRepayAmount,
				repayAmount: repayAmount,
				seizeTokens: seizeTokens,
				accountBorrowsPrior: accountBorrowsPrior,
				accountBorrows: '0',
				totalBorrows: '0',
			});
		});
		
		it(`flash liquidate`, async () => {
			await collateral.setAccountLiquidityHarness(borrower, '0', '1');
			await pretendHasBorrowed(borrower, declaredRepayAmount);
			await underlying.setBalanceHarness(recipient.address, declaredRepayAmount);
			const receipt = await borrowable.liquidate(borrower, liquidator, declaredRepayAmount, '0x1');
			
			expect(await borrowable.totalBorrows() * 1).to.eq(0);
			expect(await borrowable.borrowBalance(borrower) * 1).to.eq(0);
			expect(await borrowable.totalBalance() * 1).to.eq(declaredRepayAmount * 1);		
			expectEvent(receipt, 'Liquidate', {
				sender: root,
				borrower: borrower,
				liquidator: liquidator,
				declaredRepayAmount: declaredRepayAmount,
				repayAmount: declaredRepayAmount,
				seizeTokens: seizeTokens,
				accountBorrowsPrior: declaredRepayAmount,
				accountBorrows: '0',
				totalBorrows: '0',
			});
		});
	});
	
	describe('mint reserves', () => {
		let factory;
		let borrowable;
		let underlying;
		const er = oneMantissa.mul(new BN(3));
		const totalBalance = oneMantissa.mul(new BN(150));
		const totalBorrows = oneMantissa.mul(new BN(150));
		const totalSupply = oneMantissa.mul(new BN(100));
		const reserveFactor = oneMantissa.div(new BN(8));
		before(async () => {
			factory = await makeFactory({admin});
			borrowable = await Borrowable.new();
			underlying = await makeErc20Token();
			await borrowable.setUnderlyingHarness(underlying.address);
			await borrowable.setFactoryHarness(factory.address);
			await borrowable._setReserveFactor(reserveFactor, {from: admin});
			await factory._setReservesManager(reserveManager, {from: admin});
			await borrowable.setTotalBalance(totalBalance);
			await borrowable.setTotalBorrows(totalBorrows);
			await underlying.mint(borrowable.address, totalBalance);
		});
		
		beforeEach(async () => {
			await borrowable.setTotalSupply(totalSupply);
			const reserveTokens = await borrowable.balanceOf(reserveManager);
			await borrowable.transfer(address(0), reserveTokens, {from: reserveManager});
		});
		
		it(`er = erLast`, async () => {
			const erLast = er;
			await borrowable.setExchangeRateLast(erLast);
			await borrowable.exchangeRate();
			expect(await borrowable.balanceOf(reserveManager) * 1).to.eq(0);
			expect(await borrowable.totalSupply() * 1).to.eq(totalSupply * 1);
			expect(await borrowable.exchangeRate.call() * 1).to.eq(er * 1);
			expect(await borrowable.exchangeRateLast() * 1).to.eq(erLast * 1);
		});
		
		it(`er < erLast`, async () => {
			const erLast = er.mul(new BN(2));
			await borrowable.setExchangeRateLast(erLast);
			await borrowable.exchangeRate();
			expect(await borrowable.balanceOf(reserveManager) * 1).to.eq(0);
			expect(await borrowable.totalSupply() * 1).to.eq(totalSupply * 1);
			expect(await borrowable.exchangeRate.call() * 1).to.eq(er * 1);
			expect(await borrowable.exchangeRateLast() * 1).to.eq(erLast * 1);
		});
		
		it(`er > erLast`, async () => {
			const erLast = oneMantissa.mul(new BN(2));
			const erNew = oneMantissa.mul(new BN(2875)).div(new BN(1000));
			const mintedReserves = bnMantissa(4.347826);
			await borrowable.setExchangeRateLast(erLast);
			await borrowable.exchangeRate();
			expectAlmostEqualMantissa(await borrowable.balanceOf(reserveManager), mintedReserves);
			expectAlmostEqualMantissa(await borrowable.totalSupply(), totalSupply.add(mintedReserves));
			expect(await borrowable.exchangeRate.call() * 1).to.eq(erNew * 1);
			expect(await borrowable.exchangeRateLast() * 1).to.eq(erNew * 1);
		});
		
		it(`mint and redeem cause mint reserves`, async () => {
			const erLastA = oneMantissa.mul(new BN(2));
			const erNewA = oneMantissa.mul(new BN(2875)).div(new BN(1000));
			const profitA = er.sub(erLastA).mul(totalSupply).div(oneMantissa);
			const mintedReservesA = profitA.mul(reserveFactor).div(erNewA);
			await borrowable.setExchangeRateLast(erLastA);
			await underlying.mint(user, erNewA);
			await underlying.transfer(borrowable.address, erNewA, {from: user});
			await borrowable.mint(user);
			expect(await borrowable.balanceOf(user) * 1).to.eq(oneMantissa * 1);
			expectAlmostEqualMantissa(await borrowable.balanceOf(reserveManager), mintedReservesA);
			expect(await borrowable.exchangeRate.call() * 1).to.eq(erNewA * 1);
			
			const totalSupplyB = await borrowable.totalSupply();
			const erLastB = oneMantissa.mul(new BN(2));
			const erNewB = oneMantissa.mul(new BN(2765625)).div(new BN(1000000));
			const profitB = erNewA.sub(erLastB).mul(totalSupplyB).div(oneMantissa);
			const mintedReservesB = profitB.mul(reserveFactor).div(erNewB).add(mintedReservesA);
			await borrowable.setExchangeRateLast(erLastB);
			await borrowable.transfer(borrowable.address, oneMantissa, {from: user});
			await borrowable.redeem(user);
			expect(await underlying.balanceOf(user) * 1).to.eq(erNewB * 1);
			expectAlmostEqualMantissa(await borrowable.balanceOf(reserveManager), mintedReservesB);
			expect(await borrowable.exchangeRate.call() * 1).to.eq(erNewB * 1);
		});
	});
	
	describe('reentrancy', () => {
		let factory;
		let borrowable;
		let receiver;
		before(async () => {
			factory = await makeFactory({admin});
			borrowable = await Borrowable.new();
			await borrowable.setFactoryHarness(factory.address);
			receiver = (await ReentrantCallee.new()).address;
		});
		
		it(`borrow reentrancy`, async () => {
			await expectRevert(borrowable.borrow(address(0), receiver, '0', encode(['uint'], [1])), 'Impermax: REENTERED');
			await expectRevert(borrowable.borrow(address(0), receiver, '0', encode(['uint'], [2])), 'Impermax: REENTERED');
			await expectRevert(borrowable.borrow(address(0), receiver, '0', encode(['uint'], [3])), 'Impermax: REENTERED');
			await expectRevert(borrowable.borrow(address(0), receiver, '0', encode(['uint'], [4])), 'Impermax: REENTERED');
			await expectRevert(borrowable.borrow(address(0), receiver, '0', encode(['uint'], [5])), 'Impermax: REENTERED');
			await expectRevert(borrowable.borrow(address(0), receiver, '0', encode(['uint'], [6])), 'Impermax: REENTERED');
			await expectRevert(borrowable.borrow(address(0), receiver, '0', encode(['uint'], [0])), 'TEST');
		});
	});
});