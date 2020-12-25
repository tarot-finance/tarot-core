pragma solidity =0.5.16;

import "./Borrowable.sol";
import "./interfaces/IBDeployer.sol";

/*
 * This contract is used by the Factory to deploy Borrowable(s)
 * The bytecode would be too long to fit in the Factory
 */

contract BDeployer is IBDeployer {
	constructor () public {}
	
	function deployBorrowable(address uniswapV2Pair, address token) external returns (address borrowable) {
		bytes memory bytecode = type(Borrowable).creationCode;
		bytes32 salt = keccak256(abi.encodePacked(msg.sender, uniswapV2Pair, token));
		assembly {
			borrowable := create2(0, add(bytecode, 32), mload(bytecode), salt)
		}
	}
}