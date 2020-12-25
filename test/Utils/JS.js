"use strict";

const { expectRevert, time, BN } = require('@openzeppelin/test-helpers');
const expectEvent = require('@openzeppelin/test-helpers/src/expectEvent');
const { web3 } = require('@openzeppelin/test-helpers/src/setup');

function dfn(val, def) {
	return isFinite(val) ? val : def;
}

function last(elems) {
	return Array.isArray(elems) ? elems[elems.length - 1] : elems;
}

function lookup(obj, path = []) {
	return Array.isArray(path) ? path.reduce((a, k) => a[k], obj) : obj[path];
}

function select(obj, keys = []) {
	return keys.reduce((a, k) => (a[k] = obj[k], a), {})
}

function bnMantissa(n) {
	let den = 10e13;
	let num = Math.round(n*den);
	var len = Math.max( num.toString().length, den.toString().length, Math.round(Math.log10(num)) );
	const MAX_LEN = 14;
	if(len > MAX_LEN){
		num = Math.round(num / Math.pow(10, len - MAX_LEN));
		den = Math.round(den / Math.pow(10, len - MAX_LEN));
	}
	return (new BN(1e9)).mul(new BN(1e9)).mul(new BN(num)).div(new BN(den));
}

function uq112(n) {
	let den = 10e13;
	let num = Math.round(n*den);
	var len = Math.max( num.toString().length, den.toString().length, Math.round(Math.log10(num)) );
	const MAX_LEN = 14;
	if(len > MAX_LEN){
		num = Math.round(num / Math.pow(10, len - MAX_LEN));
		den = Math.round(den / Math.pow(10, len - MAX_LEN));
	}
	let b = (new BN(2**28)).mul(new BN(2**28)).mul(new BN(2**28)).mul(new BN(2**28)).mul(new BN(num)).div(new BN(den));	
	return b;
}

//Compare big numbers
function expectEqual(actual, expected) {
	const expectedBN = BN.isBN(expected) ? expected : new BN(expected);
	const actualBN = BN.isBN(actual) ? actual : new BN(actual);
	return assert.ok(
		expectedBN.eq(actualBN),
		`Not equal. Expected: ${expectedBN.toString()}. Actual: ${actualBN.toString()}`
	);
}

function max(a, b) {
	return a > b ? a : b
}

/*
 * WARNING
 * This function is designed to compare big numbers, using 1e18 a denom.
 * Do not use this to compare normal number, or amount of ERC20 tokens
 * with less than 18 decimal places. Use expectEqual instead.
 * This function asserts that between two numbers there is at least either
 * a max relative difference or a max absolute difference.
 */
function expectAlmostEqualMantissa(actual, expected) {
	const MAX_ABS_ERR = 0.00000000001;
	const MAX_REL_ERR = 0.0001; //0.01%
	const errRec = new BN(1/MAX_REL_ERR);
	const errAbs = bnMantissa(MAX_ABS_ERR);
	const expectedBN = BN.isBN(expected) ? expected : new BN(expected);
	const actualBN = BN.isBN(actual) ? actual : new BN(actual);
	const diffBN = expectedBN.gt(actualBN) ? expectedBN.sub(actualBN) : actualBN.sub(expectedBN);
	return assert.ok(
		diffBN.lte(errAbs) || diffBN.lte(expectedBN.div(errRec)),
		`Not almost equal. Expected: ${expectedBN.toString()}. Actual: ${actualBN.toString()}`
	);
}
function expectAlmostEqualUQ112x112(actual, expected) {
	while ((actual > expected ? actual : expected) > 1e15) {
		actual /= 10;
		expected /= 10;
	}
	const MAX_REL_ERR = 0.00001;
	const errRec = new BN(1/MAX_REL_ERR);
	const expectedBN = BN.isBN(expected) ? expected : new BN(expected);
	const actualBN = BN.isBN(actual) ? actual : new BN(actual);
	const diffBN = expectedBN.gt(actualBN) ? expectedBN.sub(actualBN) : actualBN.sub(expectedBN);
	return assert.ok(
		diffBN.lte(expectedBN.div(errRec)),
		`Not almost equal. Expected: ${expectedBN.toString()}. Actual: ${actualBN.toString()}`
	);
}

//Assumes arrays struct is the same, or throws error
function expectDeepEqualBNRecursive(actual, expected) {
	if(BN.isBN(expected)){
		return expectEqual(actual, expected);
	}
	for(let key of Object.keys(actual)){
		try {
			expectDeepEqualBNRecursive(actual[key], expected[key]);
		} catch (e) {
			throw '["'+key+'"]' + e;
		}
	}
}

function expectDeepEqualBN(actual, expected) {
	try {
		expectDeepEqualBNRecursive(actual, expected);
	} catch (e) {
		throw assert.ok(false, "expectDeepEqualBN: " + e);
	}
}


module.exports = {
	dfn,
	last,
	lookup,
	select,
	time,
	BN,
	bnMantissa,
	expectEqual,
	expectAlmostEqualMantissa,
	expectAlmostEqualUQ112x112,
	expectRevert,
	expectEvent,
	expectDeepEqualBN,
	uq112,
};
