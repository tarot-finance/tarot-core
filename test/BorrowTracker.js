const {
	Borrowable,
	MockBorrowTracker,
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
} = require('./Utils/Ethereum');

const oneMantissa = (new BN(10)).pow(new BN(18));
const K_TRACKER = (new BN(2)).pow(new BN(128));
const BORROW_BALANCE_1 = oneMantissa.mul(new BN(10));
const BORROW_INDEX_1 = oneMantissa.mul(new BN(1));
const BORROW_BALANCE_2 = oneMantissa.mul(new BN(20));
const BORROW_INDEX_2 = oneMantissa.mul(new BN(2));
const PERCENTAGE_1 = oneMantissa.div(new BN(2));
const PERCENTAGE_2 = oneMantissa.div(new BN(2));

contract('BorrowTracker', function (accounts) {
	let root = accounts[0];
	let user = accounts[1];
	let borrower1 = accounts[2];		
	let borrower2 = accounts[3];
	
	let borrowable;
	let borrowTracker;	
	
	before(async () => {
		borrowable = await Borrowable.new();
	});
	beforeEach(async () => {
		borrowTracker = await MockBorrowTracker.new();
	});
		
	it(`normally nothing happen`, async () => {
		await borrowable.setBorrowBalances(borrower1, BORROW_BALANCE_1, BORROW_INDEX_1)
		await borrowable.trackBorrow(borrower1);
		expect(await borrowTracker.relativeBorrow(borrower1) * 1).to.eq(0);
	});
	
	it(`if borrowTracker is not set nothing happen`, async () => {
		await borrowable.setBorrowTracker(address(0));
		await borrowable.setBorrowBalances(borrower1, BORROW_BALANCE_1, BORROW_INDEX_1)
		await borrowable.trackBorrow(borrower1);
		expect(await borrowTracker.relativeBorrow(borrower1) * 1).to.eq(0);
	});
	
	it(`if borrowTracker is set`, async () => {
		await borrowable.setBorrowTracker(borrowTracker.address);
		await borrowable.setBorrowBalances(borrower1, BORROW_BALANCE_1, BORROW_INDEX_1)
		await borrowable.trackBorrow(borrower1);
		expect(await borrowTracker.relativeBorrow(borrower1) * 1).to.eq(BORROW_BALANCE_1.mul(K_TRACKER).div(BORROW_INDEX_1) * 1);
		expect(await borrowTracker.borrowPercentage(borrower1) * 1).to.eq(oneMantissa * 1);
		await borrowable.setBorrowBalances(borrower2, BORROW_BALANCE_2, BORROW_INDEX_2)
		await borrowable.trackBorrow(borrower2);
		expect(await borrowTracker.relativeBorrow(borrower2) * 1).to.eq(BORROW_BALANCE_2.mul(K_TRACKER).div(BORROW_INDEX_2) * 1);
		expect(await borrowTracker.borrowPercentage(borrower1) * 1).to.eq(PERCENTAGE_1 * 1);
		expect(await borrowTracker.borrowPercentage(borrower2) * 1).to.eq(PERCENTAGE_2 * 1);
	});
});