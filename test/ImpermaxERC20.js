const {
	ImpermaxERC20,
	getDomainSeparator,
	getApprovalDigest,
	sendPermit,
} = require('./Utils/Impermax');
const {
	expectEqual,
	expectRevert,
	expectEvent,
	BN,
} = require('./Utils/JS');
const { keccak256, toUtf8Bytes } = require('ethers/utils');

const NAME = 'Ethereum';
const SYMBOL = 'ETH';
const TOTAL_SUPPLY = new BN(1000);
const TEST_AMOUNT = new BN(200);
const MAX_UINT_256 = (new BN(2)).pow(new BN(256)).sub(new BN(1));

contract('ImpermaxERC20', function (accounts) {
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
		token = await ImpermaxERC20.new(NAME, SYMBOL);
		await token.mint(user, TOTAL_SUPPLY);
	});
	
	it('name, symbol, decimals, totalSupply, balanceOf, DOMAIN_SEPARATOR, PERMIT_TYPEHASH', async () => {
		expect(await token.name()).to.eq(NAME);
		expect(await token.symbol()).to.eq(SYMBOL);
		expectEqual(await token.decimals(), 18);
		expectEqual(await token.totalSupply(), TOTAL_SUPPLY);
		expectEqual(await token.balanceOf(user), TOTAL_SUPPLY);
		expect(await token.DOMAIN_SEPARATOR()).to.eq(getDomainSeparator(NAME, token.address));
		expect(await token.PERMIT_TYPEHASH()).to.eq(
			keccak256(toUtf8Bytes('Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)'))
		);
	})
	
	it('approve', async () => {
		const receipt = await token.approve(other, TEST_AMOUNT, {from: user});
		expectEvent(receipt, 'Approval', {
			owner: user,
			spender: other,
			value: TEST_AMOUNT,
		});
		expectEqual(await token.allowance(user, other), TEST_AMOUNT);
	});

	it('transfer', async () => {
		const receipt = await token.transfer(other, TEST_AMOUNT, {from: user});
		expectEvent(receipt, 'Transfer', {
			from: user,
			to: other,
			value: TEST_AMOUNT,
		});
		expectEqual(await token.balanceOf(user), TOTAL_SUPPLY.sub(TEST_AMOUNT));
		expectEqual(await token.balanceOf(other), TEST_AMOUNT);
	});

	it('transfer:fail', async () => {
		await expectRevert(token.transfer(other, TOTAL_SUPPLY.add(new BN(1)), {from: user}), 'Impermax: TRANSFER_TOO_HIGH');
		await expectRevert(token.transfer(user, "1", {from: other}), 'Impermax: TRANSFER_TOO_HIGH');
	});

	it('transferFrom', async () => {
		await token.approve(other, TEST_AMOUNT, {from: user});
		const receipt = await token.transferFrom(user, other, TEST_AMOUNT, {from: other});
		expectEvent(receipt, 'Transfer', {
			from: user,
			to: other,
			value: TEST_AMOUNT,
		});
		expectEqual(await token.allowance(user, other), '0');
		expectEqual(await token.balanceOf(user), TOTAL_SUPPLY.sub(TEST_AMOUNT));
		expectEqual(await token.balanceOf(other), TEST_AMOUNT);
	});

	it('transferFrom:max', async () => {
		await token.approve(other, MAX_UINT_256, {from: user});
		const receipt = await token.transferFrom(user, other, TEST_AMOUNT, {from: other});
		expectEvent(receipt, 'Transfer', {
			from: user,
			to: other,
			value: TEST_AMOUNT,
		});
		expectEqual(await token.allowance(user, other), MAX_UINT_256);
		expectEqual(await token.balanceOf(user), TOTAL_SUPPLY.sub(TEST_AMOUNT));
		expectEqual(await token.balanceOf(other), TEST_AMOUNT);
	});

	it('transferFrom:fail', async () => {
		await expectRevert(token.transferFrom(user, other, TEST_AMOUNT, {from: other}), 'Impermax: TRANSFER_NOT_ALLOWED');
	});

	it('permit', async () => {
		const receipt = await sendPermit({
			token: token,
			owner: userForEip712,
			spender: otherForEip712,
			value: TEST_AMOUNT,
			deadline: MAX_UINT_256,
			private_key: userForEip712PK,
		});
		expectEvent(receipt, 'Approval', {
			//owner: userForEip712,
			//spender: otherForEip712,
			value: TEST_AMOUNT,
		});
		expectEqual(await token.allowance(userForEip712, otherForEip712), TEST_AMOUNT);
		expectEqual(await token.nonces(userForEip712), 1);		
		
		/* This should work with Metamask
		const data = JSON.stringify({
			types: {
				EIP712Domain: [
					{ name: "name", type: "string" },
					{ name: "version", type: "string" },
					{ name: "chainId", type: "uint256" },
					{ name: "verifyingContract", type: "address" },
				],
				Permit: [
					{ name: "owner", type: "address" },
					{ name: "spender", type: "address" },
					{ name: "value", type: "uint256" },
					{ name: "nonce", type: "uint256" },
					{ name: "deadline", type: "uint256" },
				],
			},
			domain: {
				name: NAME,
				version: "1",
				chainId: 1,
				verifyingContract: token.address,
			},
			primaryType: "Permit",
			message: {
				owner: user, 
				spender: other, 
				value: TEST_AMOUNT,
				nonce: nonce,
				deadline: deadline,
			}
		});
		const signer = user;
		
		web3.currentProvider.send(
			{
				method: "eth_signTypedData",
				params: [signer, data],
				from: signer
			},
			function(err, result) {
				if (err) {
					return console.error(err);
				}
				console.log(result);
				const signature = result.substring(2);
				const r1 = "0x" + signature.substring(0, 64);
				const s1 = "0x" + signature.substring(64, 128);
				const v1 = parseInt(signature.substring(128, 130), 16);
				// The signature is now comprised of r, s, and v.
				console.log(v1, r1, s1);
			}
		);*/
		
	});
	
	it('permit:fail', async () => {
		await expectRevert(
			sendPermit({
				token: token,
				owner: userForEip712,
				spender: otherForEip712,
				value: TEST_AMOUNT,
				deadline: MAX_UINT_256,
				private_key: otherForEip712PK,
			}), 'Impermax: INVALID_SIGNATURE'
		);
	});
});