const {
	makeLendingPool,
} = require('./Utils/Impermax');
const {
	expectAlmostEqualMantissa,
	expectRevert,
	expectEvent,
	bnMantissa,
	BN,
} = require('./Utils/JS');
const { keccak256, toUtf8Bytes } = require('ethers/utils');

const oneMantissa = (new BN(10)).pow(new BN(18));
const SAFETY_MARGIN_MIN = bnMantissa(Math.sqrt(1.00));
const SAFETY_MARGIN_TEST = bnMantissa(Math.sqrt(1.75));
const SAFETY_MARGIN_MAX = bnMantissa(Math.sqrt(2.50));
const LIQUIDATION_INCENTIVE_MIN = bnMantissa(1.00);
const LIQUIDATION_INCENTIVE_TEST = bnMantissa(1.03);
const LIQUIDATION_INCENTIVE_MAX = bnMantissa(1.05);

function slightlyIncrease(bn) {
	return bn.mul( bnMantissa(1.0001) ).div( oneMantissa );
}
function slightlyDecrease(bn) {
	return bn.mul( oneMantissa ).div( bnMantissa(1.0001) );
}

contract('CSetter', function (accounts) {
	let root = accounts[0];
	let user = accounts[1];
	let admin = accounts[2];
	let factory;
	let collateral;
	
	before(async () => {
		const lendingPool = await makeLendingPool({admin});
		factory = lendingPool.factory;
		collateral = lendingPool.collateral;
	});
	
	it('initialization check', async () => {
		const liquidationIncentive = bnMantissa(1.04);
		const safetyMarginSqrt = bnMantissa(Math.sqrt(2.5));
		expectAlmostEqualMantissa(await collateral.liquidationIncentive(), liquidationIncentive);
		expectAlmostEqualMantissa(await collateral.safetyMarginSqrt(), safetyMarginSqrt);
	});

	it('permissions check', async () => {
		expect(await factory.admin()).to.eq(admin);
		await collateral._setSafetyMarginSqrt(SAFETY_MARGIN_TEST, {from: admin});
		await collateral._setLiquidationIncentive(LIQUIDATION_INCENTIVE_TEST, {from: admin});
		await expectRevert(collateral._setSafetyMarginSqrt(SAFETY_MARGIN_TEST, {from: user}), 'Impermax: UNAUTHORIZED');
		await expectRevert(collateral._setLiquidationIncentive(LIQUIDATION_INCENTIVE_TEST, {from: user}), 'Impermax: UNAUTHORIZED');
	});

	it('set safety margin', async () => {
		const receipt = await collateral._setSafetyMarginSqrt(SAFETY_MARGIN_TEST, {from: admin});
		expectEvent(receipt, 'NewSafetyMargin', {});
		expectAlmostEqualMantissa(await collateral.safetyMarginSqrt(), SAFETY_MARGIN_TEST);
	});

	it('set liquidation incentive', async () => {
		const receipt = await collateral._setLiquidationIncentive(LIQUIDATION_INCENTIVE_TEST, {from: admin});
		expectEvent(receipt, 'NewLiquidationIncentive', {});
		expectAlmostEqualMantissa(await collateral.liquidationIncentive(), LIQUIDATION_INCENTIVE_TEST);
	});

	it('safety margin boundaries', async () => {
		const failMin = slightlyDecrease(SAFETY_MARGIN_MIN);
		const succeedMin = slightlyIncrease(SAFETY_MARGIN_MIN);
		const succeedMax = slightlyDecrease(SAFETY_MARGIN_MAX);
		const failMax = slightlyIncrease(SAFETY_MARGIN_MAX);
		await expectRevert(collateral._setSafetyMarginSqrt(failMin, {from: admin}), 'Impermax: INVALID_SETTING');
		await collateral._setSafetyMarginSqrt(succeedMin, {from: admin});
		expectAlmostEqualMantissa(await collateral.safetyMarginSqrt(), succeedMin);
		await collateral._setSafetyMarginSqrt(succeedMax, {from: admin});
		expectAlmostEqualMantissa(await collateral.safetyMarginSqrt(), succeedMax);
		await expectRevert(collateral._setSafetyMarginSqrt(failMax, {from: admin}), 'Impermax: INVALID_SETTING');
	});

	it('liquidation incentive boundaries', async () => {
		const failMin = slightlyDecrease(LIQUIDATION_INCENTIVE_MIN);
		const succeedMin = slightlyIncrease(LIQUIDATION_INCENTIVE_MIN);
		const succeedMax = slightlyDecrease(LIQUIDATION_INCENTIVE_MAX);
		const failMax = slightlyIncrease(LIQUIDATION_INCENTIVE_MAX);
		await expectRevert(collateral._setLiquidationIncentive(failMin, {from: admin}), 'Impermax: INVALID_SETTING');
		await collateral._setLiquidationIncentive(succeedMin, {from: admin});
		expectAlmostEqualMantissa(await collateral.liquidationIncentive(), succeedMin);
		await collateral._setLiquidationIncentive(succeedMax, {from: admin});
		expectAlmostEqualMantissa(await collateral.liquidationIncentive(), succeedMax);
		await expectRevert(collateral._setLiquidationIncentive(failMax, {from: admin}), 'Impermax: INVALID_SETTING');
	});
});