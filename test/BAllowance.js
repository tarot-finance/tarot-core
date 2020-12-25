const {
	BAllowance,
	getDomainSeparator,
	getApprovalDigest,
	sendBorrowPermit,
} = require('./Utils/Impermax');
const {
	expectEqual,
	expectRevert,
	expectEvent,
	BN,
} = require('./Utils/JS');
const {
	encodePacked,
} = require('./Utils/Ethereum');
const { keccak256, toUtf8Bytes } = require('ethers/utils');

const NAME = 'Ethereum';
const SYMBOL = 'ETH';
const TEST_AMOUNT = new BN(200);
const MAX_UINT_256 = (new BN(2)).pow(new BN(256)).sub(new BN(1));

contract('BAllowance', function (accounts) {
	let root = accounts[0];
	let user = accounts[1];
	let other = accounts[2];
	let userForEip712, userForEip712PK;
	let otherForEip712, otherForEip712PK;
	let token;
	
	before(async () => {
		const { mnemonicToSeed } = require('bip39');
		const { hdkey } = require('ethereumjs-wallet');
		const mnemonic = 'horn horn horn horn horn horn horn horn horn horn horn horn';
		const seed = await mnemonicToSeed(mnemonic);
		const hdk = hdkey.fromMasterSeed(seed);
		
		const userWallet = hdk.derivePath("m/44'/60'/0'/0/0").getWallet();
		userForEip712 = userWallet.getAddressString();
		userForEip712PK = userWallet.getPrivateKey();
		
		const otherWallet = hdk.derivePath("m/44'/60'/0'/0/1").getWallet();
		otherForEip712 = otherWallet.getAddressString();
		otherForEip712PK = otherWallet.getPrivateKey();
	});
	
	beforeEach(async () => {
		token = await BAllowance.new("Impermax", "IMX");
	});
	
	it('borrowApprove', async () => {
		const receipt = await token.borrowApprove(other, TEST_AMOUNT, {from: user});
		expectEvent(receipt, 'BorrowApproval', {
			owner: user,
			spender: other,
			value: TEST_AMOUNT,
		});
		expectEqual(await token.borrowAllowance(user, other), TEST_AMOUNT);
	});

	it('checkBorrowAllowance', async () => {
		await token.borrowApprove(other, TEST_AMOUNT, {from: user});
		await token.checkBorrowAllowance(user, other, TEST_AMOUNT.sub(new BN(1)));
		expectEqual(await token.borrowAllowance(user, other), 1);
	});

	it('checkBorrowAllowance owner is spender', async () => {
		expectEqual(await token.borrowAllowance(user, user), 0);
		await token.checkBorrowAllowance(user, user, TEST_AMOUNT);
		expectEqual(await token.borrowAllowance(user, user), 0);
	});

	it('checkBorrowAllowance fail', async () => {
		expectEqual(await token.borrowAllowance(user, other), 0);
		await expectRevert(token.checkBorrowAllowance(user, other, TEST_AMOUNT), "Impermax: BORROW_NOT_ALLOWED");
		await token.borrowApprove(other, TEST_AMOUNT, {from: user});
		await expectRevert(token.checkBorrowAllowance(user, other, TEST_AMOUNT.add(new BN(1))), "Impermax: BORROW_NOT_ALLOWED");
		await token.checkBorrowAllowance(user, other, TEST_AMOUNT);
	});
	
	it('checkBorrowAllowance max', async () => {
		await token.borrowApprove(other, MAX_UINT_256, {from: user});
		await token.checkBorrowAllowance(user, other, TEST_AMOUNT);
		expectEqual(await token.borrowAllowance(user, other), MAX_UINT_256);
	});

	it('borrowPermit', async () => {
		const receipt = await sendBorrowPermit({
			token: token,
			owner: userForEip712,
			spender: otherForEip712,
			value: TEST_AMOUNT,
			deadline: MAX_UINT_256,
			private_key: userForEip712PK,
		});
		expectEvent(receipt, 'BorrowApproval', {
			//owner: userForEip712,
			//spender: otherForEip712,
			value: TEST_AMOUNT,
		});
		expectEqual(await token.borrowAllowance(userForEip712, otherForEip712), TEST_AMOUNT);
		expectEqual(await token.nonces(userForEip712), 1);		
	});
	
	it('borrowPermit:fail', async () => {
		await expectRevert(
			sendBorrowPermit({
				token: token,
				owner: userForEip712,
				spender: otherForEip712,
				value: TEST_AMOUNT,
				deadline: MAX_UINT_256,
				private_key: otherForEip712PK,
			}), 'Impermax: INVALID_SIGNATURE'
		);				
		await expectRevert(
			sendBorrowPermit({
				token: token,
				owner: userForEip712,
				spender: otherForEip712,
				value: TEST_AMOUNT,
				deadline: new BN(1577836800), //jan 1, 2020
				private_key: userForEip712PK,
			}), 'Impermax: EXPIRED'
		);
	});
});