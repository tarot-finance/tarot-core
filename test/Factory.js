const {
	Factory,
	CollateralProduction,
	BorrowableProduction,
	Collateral,
	Borrowable,
	makeErc20Token,
	makeUniswapV2Factory,
	makeUniswapV2Pair,
	makeSimpleUniswapOracle,
	makeBDeployer,
	makeCDeployer,
	makeFactory
} = require('./Utils/Impermax');
const {
	expectEqual,
	expectAlmostEqualMantissa,
	expectRevert,
	expectEvent,
	bnMantissa,
} = require('./Utils/JS');
const {
	address,
	encodePacked,
} = require('./Utils/Ethereum');
const { keccak256 } = require('ethers/utils');

function getCreate2Address(create2Inputs) {
	const sanitizedInputs = '0x' + create2Inputs.map(i => i.slice(2)).join('');
	return address(keccak256(sanitizedInputs).slice(-40));
}

function getCollateralAddress(deployerAddress, factoryAddress, uniswapV2PairAddress) {
	const salt = keccak256(encodePacked(['address', 'address'], [factoryAddress, uniswapV2PairAddress]));
	//console.log('Collateral bytecode: ' + keccak256(CollateralProduction.bytecode));
	return getCreate2Address([
		'0xff',
		deployerAddress,
		salt,
		keccak256(CollateralProduction.bytecode)
	]);
}

function getBorrowableAddress(deployerAddress, factoryAddress, uniswapV2PairAddress, index) {
	const salt = keccak256(encodePacked(['address', 'address', 'uint8'], [factoryAddress, uniswapV2PairAddress, index]));
	//console.log('Borrowable bytecode: ' + keccak256(BorrowableProduction.bytecode));
	return getCreate2Address([
		'0xff',
		deployerAddress,
		salt,
		keccak256(BorrowableProduction.bytecode)
	]);
}

contract('Factory', function (accounts) {
	let root = accounts[0];
	let admin = accounts[1];		
	let reservesManager = accounts[2];	
	let user = accounts[3];
	
	describe('constructor', () => {
		it("correctly initialize Factory", async () => {
			const bDeployer = address(1);
			const cDeployer = address(2);
			const uniswapV2Factory = address(3);
			const simpleUniswapOracle = address(4);
			const factory = await Factory.new(admin, bDeployer, cDeployer, uniswapV2Factory, simpleUniswapOracle);
			expect(await factory.admin()).to.eq(admin);
			expect(await factory.pendingAdmin()).to.eq(address(0));
			expect(await factory.reservesManager()).to.eq(address(0));
			expectEqual(await factory.allLendingPoolsLength(), 0);
			expect(await factory.bDeployer()).to.eq(bDeployer);
			expect(await factory.cDeployer()).to.eq(cDeployer);
			expect(await factory.uniswapV2Factory()).to.eq(uniswapV2Factory);
			expect(await factory.simpleUniswapOracle()).to.eq(simpleUniswapOracle);
		});		
	});
	
	describe('create lending pool', () => {
		let factory, uniswapV2Pair1, uniswapV2Pair2, uniswapV2Pair3, uniswapV2PairIndependent;
		let ca, ba, fa;
		let collateral1, borrowable01, borrowable11;
		let collateral2, borrowable02, borrowable12;
		let collateral3, borrowable03, borrowable13;
		before(async () => {
			factory = await makeFactory();
			ca = factory.obj.cDeployer.address; ba = factory.obj.bDeployer.address; fa = factory.address;
			uniswapV2Pair1 = await makeUniswapV2Pair({
				withFactory: true, 
				uniswapV2Factory: factory.obj.uniswapV2Factory,
				t0: {symbol: 'ETH'},
				t1: {symbol: 'UNI'},
			});
			uniswapV2Pair2 = await makeUniswapV2Pair({withFactory: true, uniswapV2Factory: factory.obj.uniswapV2Factory});
			uniswapV2Pair3 = await makeUniswapV2Pair({withFactory: true, uniswapV2Factory: factory.obj.uniswapV2Factory});
			uniswapV2PairIndependent = await makeUniswapV2Pair({withFactory: true});
		});
		it('revert if pair not recognized by uniswapV2Factory', async () => {
			await expectRevert(factory.createCollateral(uniswapV2PairIndependent.address), "Impermax: NOT_UNIV2_PAIR");
			await expectRevert(factory.createBorrowable0(uniswapV2PairIndependent.address), "Impermax: NOT_UNIV2_PAIR");
			await expectRevert(factory.createBorrowable1(uniswapV2PairIndependent.address), "Impermax: NOT_UNIV2_PAIR");
		});
		it('first contract deploy also create lendingPool', async () => {
			await factory.obj.checkLendingPool(uniswapV2Pair1, {lendingPoolId: 0});
			await factory.obj.checkLendingPool(uniswapV2Pair2, {lendingPoolId: 0});
			await factory.obj.checkLendingPool(uniswapV2Pair3, {lendingPoolId: 0});
			collateral1 = await factory.createCollateral.call(uniswapV2Pair1.address);
			await factory.createCollateral(uniswapV2Pair1.address);
			borrowable02 = await factory.createBorrowable0.call(uniswapV2Pair2.address);
			await factory.createBorrowable0(uniswapV2Pair2.address);
			borrowable13 = await factory.createBorrowable1.call(uniswapV2Pair3.address);
			await factory.createBorrowable1(uniswapV2Pair3.address);
			await factory.obj.checkLendingPool(uniswapV2Pair1, {lendingPoolId: 1, collateral: collateral1});
			await factory.obj.checkLendingPool(uniswapV2Pair2, {lendingPoolId: 2, borrowable0: borrowable02});
			await factory.obj.checkLendingPool(uniswapV2Pair3, {lendingPoolId: 3, borrowable1: borrowable13});
		});
		it('collateral and borrowable addresses can be calculated offchain', () => {
			expect(collateral1.toLowerCase()).to.eq(getCollateralAddress(ca, fa, uniswapV2Pair1.address));
			expect(borrowable02.toLowerCase()).to.eq(getBorrowableAddress(ba, fa, uniswapV2Pair2.address, 0));
			expect(borrowable13.toLowerCase()).to.eq(getBorrowableAddress(ba, fa, uniswapV2Pair3.address, 1));
		});
		it('collateral and borrowable addresses are dependent on factory', () => {
			expect(getCollateralAddress(ca, fa, uniswapV2Pair1.address)).to.not.eq(
				getCollateralAddress(ca, root, uniswapV2Pair1.address)
			);
			expect(getBorrowableAddress(ba, fa, uniswapV2Pair2.address, 0)).to.not.eq(
				getBorrowableAddress(ba, root, uniswapV2Pair2.address, 0)
			);
		});
		it('revert if already exists', async () => {
			await expectRevert(factory.createCollateral(uniswapV2Pair1.address), "Impermax: ALREADY_EXISTS");
			await expectRevert(factory.createBorrowable0(uniswapV2Pair2.address), "Impermax: ALREADY_EXISTS");
			await expectRevert(factory.createBorrowable1(uniswapV2Pair3.address), "Impermax: ALREADY_EXISTS");			
		});
		it('second contract deploy reuse lendingPool', async () => {
			borrowable01 = await factory.createBorrowable0.call(uniswapV2Pair1.address);
			await factory.createBorrowable0(uniswapV2Pair1.address);
			borrowable12 = await factory.createBorrowable1.call(uniswapV2Pair2.address);
			await factory.createBorrowable1(uniswapV2Pair2.address);
			collateral3 = await factory.createCollateral.call(uniswapV2Pair3.address);
			await factory.createCollateral(uniswapV2Pair3.address);
			await factory.obj.checkLendingPool(uniswapV2Pair1, {lendingPoolId: 1, borrowable0: borrowable01});
			await factory.obj.checkLendingPool(uniswapV2Pair2, {lendingPoolId: 2, borrowable1: borrowable12});
			await factory.obj.checkLendingPool(uniswapV2Pair3, {lendingPoolId: 3, collateral: collateral3});
		}); 
		it('initialize revert if not all three contracts are deployed', async () => {
			await expectRevert(factory.initializeLendingPool(uniswapV2Pair1.address), "Impermax: BORROWABLE1_NOT_CREATED");
			await expectRevert(factory.initializeLendingPool(uniswapV2Pair2.address), "Impermax: COLLATERALIZABLE_NOT_CREATED");
			await expectRevert(factory.initializeLendingPool(uniswapV2Pair3.address), "Impermax: BORROWABLE0_NOT_CREATED");
		}); 
		it('third contract deploy reuse lendingPool', async () => {
			borrowable11 = await factory.createBorrowable1.call(uniswapV2Pair1.address);
			await factory.createBorrowable1(uniswapV2Pair1.address);
			collateral2 = await factory.createCollateral.call(uniswapV2Pair2.address);
			await factory.createCollateral(uniswapV2Pair2.address);
			borrowable03 = await factory.createBorrowable0.call(uniswapV2Pair3.address);
			await factory.createBorrowable0(uniswapV2Pair3.address);
			await factory.obj.checkLendingPool(uniswapV2Pair1, {lendingPoolId: 1, borrowable1: borrowable11});
			await factory.obj.checkLendingPool(uniswapV2Pair2, {lendingPoolId: 2, collateral: collateral2});
			await factory.obj.checkLendingPool(uniswapV2Pair3, {lendingPoolId: 3, borrowable0: borrowable03});
		});
		it('only the factory can initialize PoolTokens', async () => {
			const lendingPool = await factory.getLendingPool(uniswapV2Pair1.address);
			await expectRevert((await Collateral.at(lendingPool.collateral))._initialize(
				"", "", address(0), address(0), address(0)
			), "Impermax: UNAUTHORIZED");
			await expectRevert((await Borrowable.at(lendingPool.borrowable0))._initialize(
				"", "", address(0), address(0)
			), "Impermax: UNAUTHORIZED");
			await expectRevert((await Borrowable.at(lendingPool.borrowable1))._initialize(
				"", "", address(0), address(0)
			), "Impermax: UNAUTHORIZED");
		}); 
		it('factory can only be set once', async () => {
			const lendingPool = await factory.getLendingPool(uniswapV2Pair1.address);
			await expectRevert((await Collateral.at(lendingPool.collateral))._setFactory(), "Impermax: FACTORY_ALREADY_SET");
			await expectRevert((await Borrowable.at(lendingPool.borrowable0))._setFactory(), "Impermax: FACTORY_ALREADY_SET");
			await expectRevert((await Borrowable.at(lendingPool.borrowable1))._setFactory(), "Impermax: FACTORY_ALREADY_SET");
		}); 
		it('initially is not initialized', async () => {
			await factory.obj.checkLendingPool(uniswapV2Pair1, {initialized: false});
			await factory.obj.checkLendingPool(uniswapV2Pair2, {initialized: false});
			await factory.obj.checkLendingPool(uniswapV2Pair3, {initialized: false});
		});
		it('simpleUniswapOracle can be initialized or not', async () => {
			expect( (await factory.obj.simpleUniswapOracle.getPair(uniswapV2Pair1.address)).initialized ).to.eq(false);
			expect( (await factory.obj.simpleUniswapOracle.getPair(uniswapV2Pair2.address)).initialized ).to.eq(false);
			await factory.obj.simpleUniswapOracle.initialize(uniswapV2Pair3.address);
			expect( (await factory.obj.simpleUniswapOracle.getPair(uniswapV2Pair3.address)).initialized ).to.eq(true);
		});
		it('initialize', async () => {
			const receipt1 = await factory.initializeLendingPool(uniswapV2Pair1.address);
			const receipt2 = await factory.initializeLendingPool(uniswapV2Pair2.address);
			const receipt3 = await factory.initializeLendingPool(uniswapV2Pair3.address);
			await factory.obj.checkLendingPool(uniswapV2Pair1, {initialized: true});
			await factory.obj.checkLendingPool(uniswapV2Pair2, {initialized: true});
			await factory.obj.checkLendingPool(uniswapV2Pair3, {initialized: true});
			expectEvent(receipt1, 'LendingPoolInitialized', {
				uniswapV2Pair: uniswapV2Pair1.address,
				token0: uniswapV2Pair1.obj.token0.address,
				token1: uniswapV2Pair1.obj.token1.address,
				collateral: collateral1,
				borrowable0: borrowable01,
				borrowable1: borrowable11,
				lendingPoolId: "1",
			});
		});
		it('collateral is initialized correctly', async () => {
			const collateral = await Collateral.at(collateral1);
			expect(await collateral.name()).to.eq("Impermax UniV2: ETH-UNI-1");
			expect(await collateral.symbol()).to.eq("iETH-UNI-1");
			expect(await collateral.underlying()).to.eq(uniswapV2Pair1.address);
			expect(await collateral.borrowable0()).to.eq(borrowable01);
			expect(await collateral.borrowable1()).to.eq(borrowable11);
		});
		it('borrowable0 is initialized correctly', async () => {
			const borrowable0 = await Borrowable.at(borrowable01);
			expect(await borrowable0.name()).to.eq("Impermax UniV2: ETH-1");
			expect(await borrowable0.symbol()).to.eq("iETH-1");
			expect(await borrowable0.underlying()).to.eq(uniswapV2Pair1.obj.token0.address);
			expect(await borrowable0.collateral()).to.eq(collateral1);
		});
		it('borrowable1 is initialized correctly', async () => {
			const borrowable1 = await Borrowable.at(borrowable11);
			expect(await borrowable1.name()).to.eq("Impermax UniV2: UNI-1");
			expect(await borrowable1.symbol()).to.eq("iUNI-1");
			expect(await borrowable1.underlying()).to.eq(uniswapV2Pair1.obj.token1.address);
			expect(await borrowable1.collateral()).to.eq(collateral1);
		});
		it('simpleUniswapOracle is initialized correctly', async () => {
			expect( (await factory.obj.simpleUniswapOracle.getPair(uniswapV2Pair1.address)).initialized ).to.eq(true);
			expect( (await factory.obj.simpleUniswapOracle.getPair(uniswapV2Pair2.address)).initialized ).to.eq(true);
			expect( (await factory.obj.simpleUniswapOracle.getPair(uniswapV2Pair3.address)).initialized ).to.eq(true);
		});
		it('revert if already initialized', async () => {
			await expectRevert(factory.initializeLendingPool(uniswapV2Pair1.address), "Impermax: ALREADY_INITIALIZED");
			await expectRevert(factory.initializeLendingPool(uniswapV2Pair2.address), "Impermax: ALREADY_INITIALIZED");
			await expectRevert(factory.initializeLendingPool(uniswapV2Pair3.address), "Impermax: ALREADY_INITIALIZED");
		});
	});
	
	describe('uint2str', () => {
		let factory;
		before(async () => {
			factory = await makeFactory({admin});
		});		
		it('uint2str works', async () => {
			[0, 1, 14, 984, 19348, 2839848, 2389, 736832, 5646124, 445645].forEach(async (n) => {
				expect(await factory.uint2str(n)).to.eq(n.toString());
			});
		}); 
	});
	
	describe('admin', () => {
		let factory;
		beforeEach(async () => {
			factory = await makeFactory({admin});
		});
		it("change admin", async () => {
			await expectRevert(factory._setPendingAdmin(root, {from: root}), "Impermax: UNAUTHORIZED");
			await expectRevert(factory._acceptAdmin({from: root}), "Impermax: UNAUTHORIZED");
			expectEvent(await factory._setPendingAdmin(root, {from: admin}), "NewPendingAdmin", {
				'oldPendingAdmin': address(0),
				'newPendingAdmin': root,
			});
			expect(await factory.admin()).to.eq(admin);
			expect(await factory.pendingAdmin()).to.eq(root);
			receipt = await factory._acceptAdmin({from: root});
			expectEvent(receipt, "NewAdmin", {
				'oldAdmin': admin,
				'newAdmin': root,
			});
			expectEvent(receipt, "NewPendingAdmin", {
				'oldPendingAdmin': root,
				'newPendingAdmin': address(0),
			});
			expect(await factory.admin()).to.eq(root);
			expect(await factory.pendingAdmin()).to.eq(address(0));
		});
		it("change reserves manager", async () => {
			await expectRevert(factory._setReservesManager(reservesManager, {from: reservesManager}), "Impermax: UNAUTHORIZED");
			expectEvent(await factory._setReservesManager(reservesManager, {from: admin}), "NewReservesManager", {
				'oldReservesManager': address(0),
				'newReservesManager': reservesManager,
			});
			expect(await factory.reservesManager()).to.eq(reservesManager);
			await factory._setReservesManager(root, {from: admin});
			expect(await factory.reservesManager()).to.eq(root);
		});
	});
});