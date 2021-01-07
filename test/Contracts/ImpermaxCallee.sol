pragma solidity =0.5.16;

import "../../contracts/interfaces/IImpermaxCallee.sol";
import "./Recipient.sol";

contract ImpermaxCallee is IImpermaxCallee {

	address recipient;
	address underlying;
	
	constructor (address _recipient, address _underlying) public {
		recipient = _recipient;
		underlying = _underlying;
	}

	function impermaxBorrow(address sender, address borrower, uint borrowAmount, bytes calldata data) external {
		sender; borrower; borrowAmount; data;
		Recipient(recipient).empty(underlying, msg.sender);
	}
	
    function impermaxRedeem(address sender, uint redeemAmount, bytes calldata data) external {
		sender; redeemAmount; data;
		Recipient(recipient).empty(underlying, msg.sender);
	}
	
}