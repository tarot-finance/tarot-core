const {
	makePoolToken,
} = require('./Utils/Impermax');
const {
	expectEqual,
	expectEvent,
	bnMantissa,
	BN,
} = require('./Utils/JS');
const {
	address,
} = require('./Utils/Ethereum');
const { keccak256, toUtf8Bytes } = require('ethers/utils');

const oneMantissa = (new BN(10)).pow(new BN(18));
const TOTAL_SUPPLY = bnMantissa(1000);
const TEST_AMOUNT = bnMantissa(200);
const MAX_UINT_256 = (new BN(2)).pow(new BN(256)).sub(new BN(1));
const INITIAL_EXCHANGE_RATE = oneMantissa;
const MINIMUM_LIQUIDITY = new BN(1000);

contract('PoolToken', function (accounts) {
	let root = accounts[0];
	let user = accounts[1];
	let other = accounts[2];
	let poolToken;
	
	before(async () => {
		poolToken = await makePoolToken();
		await poolToken.obj.underlying.mint(user, TOTAL_SUPPLY);
	});

	it('initial exchange rate', async () => {
		expectEqual(await poolToken.exchangeRate.call(), INITIAL_EXCHANGE_RATE);
	});

	it('initial sync', async () => {
		const receipt = await poolToken.sync();
		expectEvent(receipt, 'Sync', {
			totalBalance: new BN(0),
		});
		
		expectEqual(await poolToken.totalSupply(), new BN(0));
		expectEqual(await poolToken.obj.underlying.balanceOf(poolToken.address), new BN(0));
		expectEqual(await poolToken.totalBalance(), new BN(0));
	});

	it('mint', async () => {
		await poolToken.obj.underlying.transfer(poolToken.address, TEST_AMOUNT, {from: user});
		const expectedTokens = TEST_AMOUNT.mul(oneMantissa).div(INITIAL_EXCHANGE_RATE);
		const tokens = await poolToken.mint.call(user);
		const receipt = await poolToken.mint(user);
		expectEvent(receipt, 'Transfer', {
			from: address(0),
			to: address(0),
			value: MINIMUM_LIQUIDITY,
		});
		expectEvent(receipt, 'Transfer', {
			from: address(0),
			to: user,
			value: expectedTokens.sub(MINIMUM_LIQUIDITY),
		});
		expectEvent(receipt, 'Sync', {
			totalBalance: TEST_AMOUNT,
		});
		expectEvent(receipt, 'Mint', {
			sender: root,
			minter: user,
			mintAmount: TEST_AMOUNT,
			mintTokens: expectedTokens.sub(MINIMUM_LIQUIDITY),
		});
		expectEqual(tokens, expectedTokens.sub(MINIMUM_LIQUIDITY));
		expectEqual(await poolToken.totalSupply(), expectedTokens);
		expectEqual(await poolToken.balanceOf(user), expectedTokens.sub(MINIMUM_LIQUIDITY));
		expectEqual(await poolToken.obj.underlying.balanceOf(poolToken.address), TEST_AMOUNT);
		expectEqual(await poolToken.totalBalance(), TEST_AMOUNT);
		expectEqual(await poolToken.obj.underlying.balanceOf(user), TOTAL_SUPPLY.sub(TEST_AMOUNT));
		expectEqual(await poolToken.exchangeRate.call(), INITIAL_EXCHANGE_RATE);
	});

	it('redeem', async () => {
		const redeemTokens = TEST_AMOUNT.mul(oneMantissa).div(INITIAL_EXCHANGE_RATE).sub(MINIMUM_LIQUIDITY);
		const redeemAmount = redeemTokens.mul(INITIAL_EXCHANGE_RATE).div(oneMantissa);
		const poolTokenBalance = TEST_AMOUNT.sub(redeemAmount);
		await poolToken.transfer(poolToken.address, redeemTokens, {from: user});
		const amount = await poolToken.redeem.call(user);
		const receipt = await poolToken.redeem(user);
		expectEvent(receipt, 'Transfer', {
			from: poolToken.address,
			to: address(0),
			value: redeemTokens,
		});
		expectEvent(receipt, 'Transfer', {
			from: poolToken.address,
			to: user,
			value: redeemAmount,
		});
		expectEvent(receipt, 'Sync', {
			totalBalance: poolTokenBalance,
		});
		expectEvent(receipt, 'Redeem', {
			sender: root,
			redeemer: user,
			redeemAmount: redeemAmount,
			redeemTokens: redeemTokens,
		});
		
		expectEqual(redeemAmount, amount);
		expectEqual(await poolToken.totalSupply(), poolTokenBalance.mul(oneMantissa).div(INITIAL_EXCHANGE_RATE));
		expectEqual(await poolToken.balanceOf(user), 0);
		expectEqual(await poolToken.obj.underlying.balanceOf(poolToken.address), poolTokenBalance);
		expectEqual(await poolToken.totalBalance(), poolTokenBalance);
		expectEqual(await poolToken.obj.underlying.balanceOf(user), TOTAL_SUPPLY.sub(poolTokenBalance));
		expectEqual(await poolToken.exchangeRate.call(), INITIAL_EXCHANGE_RATE);
	});

	it('skim', async () => {
		const prevTotalSupply = await poolToken.totalSupply();
		const prevUserBalance = await poolToken.balanceOf(user);
		const prevUnderlyingPoolTokenBalance = await poolToken.obj.underlying.balanceOf(poolToken.address);
		const prevTotalBalance = await poolToken.totalBalance();
		const prevUnderlyingUserBalance = await poolToken.obj.underlying.balanceOf(user);
		const prevExchangeRate = await poolToken.exchangeRate.call();
		
		await poolToken.obj.underlying.transfer(poolToken.address, TEST_AMOUNT, {from: user});
		const receipt = await poolToken.skim(user);
		expectEvent(receipt, 'Transfer', {
			from: poolToken.address,
			to: user,
			value: TEST_AMOUNT,
		});
		
		expectEqual(await poolToken.totalSupply(), prevTotalSupply);
		expectEqual(await poolToken.balanceOf(user), prevUserBalance);
		expectEqual(await poolToken.obj.underlying.balanceOf(poolToken.address), prevUnderlyingPoolTokenBalance);
		expectEqual(await poolToken.totalBalance(), prevTotalBalance);
		expectEqual(await poolToken.obj.underlying.balanceOf(user), prevUnderlyingUserBalance);
		expectEqual(await poolToken.exchangeRate.call(), prevExchangeRate);
	});

	it('sync', async () => {
		const prevTotalSupply = await poolToken.totalSupply();
		const prevTotalBalance = await poolToken.totalBalance();
		
		await poolToken.obj.underlying.transfer(poolToken.address, TEST_AMOUNT, {from: user});
		const receipt = await poolToken.sync();
		const poolTokenBalance = prevTotalBalance.add(TEST_AMOUNT);
		expectEvent(receipt, 'Sync', {
			totalBalance: poolTokenBalance,
		});
		
		expectEqual(await poolToken.totalSupply(), prevTotalSupply);
		expectEqual(await poolToken.balanceOf(user), 0);
		expectEqual(await poolToken.obj.underlying.balanceOf(poolToken.address), poolTokenBalance);
		expectEqual(await poolToken.totalBalance(), poolTokenBalance);
		expectEqual(await poolToken.obj.underlying.balanceOf(user), TOTAL_SUPPLY.sub(poolTokenBalance));
		expectEqual(await poolToken.exchangeRate.call(), poolTokenBalance.mul(oneMantissa).div(prevTotalSupply));
	});
});