const {
	makeLendingPool,
} = require('./Utils/Impermax');
const {
	expectEqual,
	expectAlmostEqualMantissa,
	expectRevert,
	expectEvent,
	bnMantissa,
	BN,
} = require('./Utils/JS');
const { keccak256, toUtf8Bytes } = require('ethers/utils');


const SECONDS_IN_DAY = 24 * 3600;
const oneMantissa = (new BN(10)).pow(new BN(18));
const TEST_AMOUNT = bnMantissa(100);
const MAX_UINT_256 = (new BN(2)).pow(new BN(256)).sub(new BN(1));
const RESERVE_FACTOR_TEST = bnMantissa(0.15);
const RESERVE_FACTOR_MAX = bnMantissa(0.2);
const KINK_UR_MIN = bnMantissa(0.6);
const KINK_UR_TEST = bnMantissa(0.8);
const KINK_UR_MAX = bnMantissa(0.9);
const ADJUST_SPEED_MIN = bnMantissa(0.005 / SECONDS_IN_DAY);
const ADJUST_SPEED_TEST = bnMantissa(0.01 / SECONDS_IN_DAY);
const ADJUST_SPEED_MAX = bnMantissa(0.5 / SECONDS_IN_DAY);

function slightlyIncrease(bn) {
	return bn.mul( bnMantissa(1.0001) ).div( oneMantissa );
}
function slightlyDecrease(bn) {
	return bn.mul( oneMantissa ).div( bnMantissa(1.0001) );
}


contract('BSetter', function (accounts) {
	let root = accounts[0];
	let user = accounts[1];
	let admin = accounts[2];
	let factory;
	let borrowable;
	let underlying;
	
	before(async () => {
		const lendingPool = await makeLendingPool({admin});
		factory = lendingPool.factory;
		borrowable = lendingPool.borrowable0;
		underlying = lendingPool.uniswapV2Pair.obj.token0;
	});
	
	it('initialization check', async () => {
		const reserveFactor = bnMantissa(0.1);
		const kinkUtilizationRate = bnMantissa(0.7);
		const adjustSpeed = bnMantissa(0.05 / SECONDS_IN_DAY);
		expectAlmostEqualMantissa(await borrowable.reserveFactor(), reserveFactor);
		expectAlmostEqualMantissa(await borrowable.kinkUtilizationRate(), kinkUtilizationRate);
		expectAlmostEqualMantissa(await borrowable.adjustSpeed(), adjustSpeed);
		expectAlmostEqualMantissa(await borrowable.exchangeRate.call(), await borrowable.exchangeRateLast());
	});

	it('permissions check', async () => {
		expect(await factory.admin()).to.eq(admin);
		await borrowable._setReserveFactor(RESERVE_FACTOR_TEST, {from: admin});
		await borrowable._setKinkUtilizationRate(KINK_UR_TEST, {from: admin});
		await borrowable._setAdjustSpeed(ADJUST_SPEED_TEST, {from: admin});
		await expectRevert(borrowable._setReserveFactor(RESERVE_FACTOR_TEST, {from: user}), 'Impermax: UNAUTHORIZED');
		await expectRevert(borrowable._setKinkUtilizationRate(KINK_UR_TEST, {from: user}), 'Impermax: UNAUTHORIZED');
		await expectRevert(borrowable._setAdjustSpeed(ADJUST_SPEED_TEST, {from: user}), 'Impermax: UNAUTHORIZED');
	});

	it('set reserve factory', async () => {
		const receipt = await borrowable._setReserveFactor(RESERVE_FACTOR_TEST, {from: admin});
		expectEvent(receipt, 'NewReserveFactor', {});
		expectAlmostEqualMantissa(await borrowable.reserveFactor(), RESERVE_FACTOR_TEST);
	});

	it('set kink utilization rate', async () => {
		const receipt = await borrowable._setKinkUtilizationRate(KINK_UR_TEST, {from: admin});
		expectEvent(receipt, 'NewKinkUtilizationRate', {});
		expectAlmostEqualMantissa(await borrowable.kinkUtilizationRate(), KINK_UR_TEST);
	});

	it('set adjust speed', async () => {
		const receipt = await borrowable._setAdjustSpeed(ADJUST_SPEED_TEST, {from: admin});
		expectEvent(receipt, 'NewAdjustSpeed', {});
		expectAlmostEqualMantissa(await borrowable.adjustSpeed(), ADJUST_SPEED_TEST);
	});

	it('reserve factory boundaries', async () => {
		const succeedMin = bnMantissa(0);
		const succeedMax = slightlyDecrease(RESERVE_FACTOR_MAX);
		const failMax = slightlyIncrease(RESERVE_FACTOR_MAX);
		await borrowable._setReserveFactor(succeedMin, {from: admin});
		expectAlmostEqualMantissa(await borrowable.reserveFactor(), succeedMin);
		await borrowable._setReserveFactor(succeedMax, {from: admin});
		expectAlmostEqualMantissa(await borrowable.reserveFactor(), succeedMax);
		await expectRevert(borrowable._setReserveFactor(failMax, {from: admin}), 'Impermax: INVALID_SETTING');
	});

	it('kink utilization rate boundaries', async () => {
		const failMin = slightlyDecrease(KINK_UR_MIN);
		const succeedMin = slightlyIncrease(KINK_UR_MIN);
		const succeedMax = slightlyDecrease(KINK_UR_MAX);
		const failMax = slightlyIncrease(KINK_UR_MAX);
		await expectRevert(borrowable._setKinkUtilizationRate(failMin, {from: admin}), 'Impermax: INVALID_SETTING');
		await borrowable._setKinkUtilizationRate(succeedMin, {from: admin});
		expectAlmostEqualMantissa(await borrowable.kinkUtilizationRate(), succeedMin);
		await borrowable._setKinkUtilizationRate(succeedMax, {from: admin});
		expectAlmostEqualMantissa(await borrowable.kinkUtilizationRate(), succeedMax);
		await expectRevert(borrowable._setKinkUtilizationRate(failMax, {from: admin}), 'Impermax: INVALID_SETTING');
	});

	it('adjust speed boundaries', async () => {
		const failMin = slightlyDecrease(ADJUST_SPEED_MIN);
		const succeedMin = slightlyIncrease(ADJUST_SPEED_MIN);
		const succeedMax = slightlyDecrease(ADJUST_SPEED_MAX);
		const failMax = slightlyIncrease(ADJUST_SPEED_MAX);
		await expectRevert(borrowable._setAdjustSpeed(failMin, {from: admin}), 'Impermax: INVALID_SETTING');
		await borrowable._setAdjustSpeed(succeedMin, {from: admin});
		expectAlmostEqualMantissa(await borrowable.adjustSpeed(), succeedMin);
		await borrowable._setAdjustSpeed(succeedMax, {from: admin});
		expectAlmostEqualMantissa(await borrowable.adjustSpeed(), succeedMax);
		await expectRevert(borrowable._setAdjustSpeed(failMax, {from: admin}), 'Impermax: INVALID_SETTING');
	});
});