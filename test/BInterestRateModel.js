const {
	BInterestRateModel,
} = require('./Utils/Impermax');
const {
	expectAlmostEqualMantissa,
	expectEvent,
	bnMantissa,
	BN,
} = require('./Utils/JS');
const {
	increaseTime,
} = require('./Utils/Ethereum');

const MAX_UINT_32 = 2**32 - 1;
const SECONDS_IN_YEAR = 3600 * 24 * 365;
const SECONDS_IN_DAY = 3600 * 24;

/*
	NOTES ON TESTING
	- calculateBorrowRate should be called at the end of a transaction. It is tested assuming that the paramaters passed in the testcase have been updated in the same transaction right before calling calculateBorrowRate.
	- accrueInterest should be called at the beginning of a transaction. It is tested assuming that the parameters passed in the testcase have been updated in the previous transaction at the timestamp of the previous testcase.
*/


contract('BInterestRateModel', function (accounts) {
	
	describe('calculateBorrowRate', () => {
		let token;
		let rateUpdateTimestamp = new BN(0);
		let borrowRate = 0;
		let kinkBorrowRate = 0.05 / SECONDS_IN_YEAR;
		const adjustSpeed = 0.01 / SECONDS_IN_DAY;
		const kinkUtilizationRate = 0.8;
		const KINK_BORROW_RATE_MAX = 1 / SECONDS_IN_YEAR;
		const KINK_BORROW_RATE_MIN = 0.01 / SECONDS_IN_YEAR;
		const KINK_MULTIPLIER = 5;
		
		before(async () => {
			token = await BInterestRateModel.new();
			await token.setKinkUtilizationRate(bnMantissa(kinkUtilizationRate));
			await token.setAdjustSpeed(bnMantissa(adjustSpeed));
		});
				
		function getBorrowRate(utilizationRate, kinkBorrowRate) {
			if (utilizationRate < kinkUtilizationRate) {
				return utilizationRate / kinkUtilizationRate * kinkBorrowRate;
			} else {
				const overUtilization = (utilizationRate - kinkUtilizationRate) / (1 - kinkUtilizationRate);
				return kinkBorrowRate * (1 + overUtilization * (KINK_MULTIPLIER - 1));
			}
		}
		
		[
			{timeElapsed: 2 * 24 * 3600, totalBorrows: 0, totalBalance: 0},
			{timeElapsed: 3 * 24 * 3600, totalBorrows: 500, totalBalance: 500},
			{timeElapsed: 0 * 24 * 3600, totalBorrows: 900, totalBalance: 100},
			{timeElapsed: 1 * 24 * 3600, totalBorrows: 800, totalBalance: 200},
			{timeElapsed: 1.5 * 24 * 3600, totalBorrows: 750, totalBalance: 750},
			{timeElapsed: 5 * 24 * 3600, totalBorrows: 1500, totalBalance: 500},
			{timeElapsed: 24 * 24 * 3600, totalBorrows: 1610, totalBalance: 390},
			{timeElapsed: 5000 * 24 * 3600, totalBorrows: 1600, totalBalance: 400},
			{timeElapsed: 5000 * 24 * 3600, totalBorrows: 2000, totalBalance: 0},
			{timeElapsed: 5000 * 24 * 3600, totalBorrows: 0, totalBalance: 2000},
			{timeElapsed: 5000 * 24 * 3600, totalBorrows: 1000, totalBalance: 1000},
		].forEach((testCase) => {
			it(`calculateBorrowRate for ${JSON.stringify(testCase)}`, async () => {
				const {timeElapsed, totalBorrows, totalBalance} = testCase;
				await increaseTime(timeElapsed);
				await token.setTotalBorrows(bnMantissa(totalBorrows));
				await token.setTotalBalance(bnMantissa(totalBalance));
				
				const actualBalance = totalBorrows + totalBalance;
				const utilizationRate = (actualBalance == 0) ? 0 : totalBorrows / actualBalance;
				const adjustLength = timeElapsed * adjustSpeed;
				const adjustFactor = (borrowRate - kinkBorrowRate) / kinkBorrowRate * adjustLength;
				let expectedKinkBorrowRate = kinkBorrowRate * (1 + adjustFactor);
				if (expectedKinkBorrowRate > KINK_BORROW_RATE_MAX) expectedKinkBorrowRate = KINK_BORROW_RATE_MAX;
				if (expectedKinkBorrowRate < KINK_BORROW_RATE_MIN) expectedKinkBorrowRate = KINK_BORROW_RATE_MIN;
				let expectedBorrowRate = getBorrowRate(utilizationRate, expectedKinkBorrowRate);
				
				const receipt = await token.calculateBorrowRate();
				const kinkBorrowRateOC = await token.kinkBorrowRate();
				const borrowRateOC = await token.borrowRate();
				
				//console.log(kinkBorrowRateOC / 1e18, expectedKinkBorrowRate / 1e18);
				//console.log(borrowRateOC / 1e18, expectedBorrowRate / 1e18);
				
				if( timeElapsed > 0) {
					expectEvent(receipt, 'CalculateKinkBorrowRate', {
						kinkBorrowRate: kinkBorrowRateOC,
					});
				}
				expectEvent(receipt, 'CalculateBorrowRate', {
					borrowRate: borrowRateOC,
				});
				expectAlmostEqualMantissa(kinkBorrowRateOC, bnMantissa(expectedKinkBorrowRate));
				expectAlmostEqualMantissa(borrowRateOC, bnMantissa(expectedBorrowRate));

				kinkBorrowRate = kinkBorrowRateOC / 1e18;
				borrowRate = borrowRateOC / 1e18;
			});
		});
	});
	
	describe('accrueInterest', () => {
		let token;
		let accrualTimestamp = new BN(0);
		let totalBorrows = 0;
	    let borrowIndex = 1;
		
		before(async () => {
			token = await BInterestRateModel.new();
		});
		
		[
			{timeElapsed: 2 * 24 * 3600, borrowRate: 0.0, borrowVariance: +1000},
			{timeElapsed: 3 * 24 * 3600, borrowRate: 0.03, borrowVariance: 0},
			{timeElapsed: 0 * 24 * 3600, borrowRate: 0.05, borrowVariance: 0},
			{timeElapsed: 1 * 24 * 3600, borrowRate: 0.07, borrowVariance: 0},
			{timeElapsed: 5 * 24 * 3600, borrowRate: 0.09, borrowVariance: +100},
			{timeElapsed: 20 * 24 * 3600, borrowRate: 0.01, borrowVariance: -200},
		].forEach((testCase) => {
			it(`accrueInterest for ${JSON.stringify(testCase)}`, async () => {
				const {timeElapsed, borrowRate, borrowVariance} = testCase;
				await increaseTime(timeElapsed);
				totalBorrows += borrowVariance;
				const totalBorrowsPreAccrue = bnMantissa(totalBorrows);
				await token.setBorrowRate(bnMantissa(borrowRate / SECONDS_IN_YEAR));
				await token.setTotalBorrows(totalBorrowsPreAccrue);
				
				const borrowIndexAccumulated = borrowIndex * borrowRate * timeElapsed / SECONDS_IN_YEAR;
				const borrowsAccumulated = totalBorrows * borrowRate * timeElapsed / SECONDS_IN_YEAR;
				borrowIndex += borrowIndexAccumulated;
				totalBorrows += borrowsAccumulated;
								
				const receipt = await token.accrueInterest();
				const borrowIndexOC = await token.borrowIndex();
				const totalBorrowsOC = await token.totalBorrows();
				
				if( timeElapsed > 0) {
					expectEvent(receipt, 'AccrueInterest', {
						interestAccumulated: totalBorrowsOC.sub(totalBorrowsPreAccrue),
						borrowIndex: borrowIndexOC,
						totalBorrows: totalBorrowsOC,
					});
				}
				expectAlmostEqualMantissa(borrowIndexOC, bnMantissa(borrowIndex));
				expectAlmostEqualMantissa(totalBorrowsOC, bnMantissa(totalBorrows));
				borrowIndex = borrowIndexOC / 1e18;
				totalBorrows = totalBorrowsOC / 1e18;
			});
		});
	});
});