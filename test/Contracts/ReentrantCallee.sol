pragma solidity =0.5.16;

import "../../contracts/interfaces/IBorrowable.sol";
import "../../contracts/interfaces/IImpermaxCallee.sol";

contract ReentrantCallee is IImpermaxCallee {
	
	constructor () public {}

	function impermaxBorrow(address sender, address borrower, uint borrowAmount, bytes calldata data) external {
		sender; borrower; borrowAmount;
		address a = address(this);
		(uint i) = abi.decode(data, (uint));
		require(i != 0, "TEST");
		if (i == 1) IBorrowable(msg.sender).mint(a);
		else if (i == 2) IBorrowable(msg.sender).redeem(a);
		else if (i == 3) IBorrowable(msg.sender).skim(a);
		else if (i == 4) IBorrowable(msg.sender).sync();
		else if (i == 5) IBorrowable(msg.sender).borrow(a, a, 0, new bytes(0));
		else if (i == 6) IBorrowable(msg.sender).liquidate(a, a, 0, new bytes(0));
		else if (i == 7) IBorrowable(msg.sender).underlying();
	}
	
    function impermaxLiquidate(address sender, address borrower, uint repayAmount, bytes calldata data) external {
		sender; borrower; repayAmount;
		address a = address(this);
		(uint i) = abi.decode(data, (uint));
		if (i == 1) IBorrowable(msg.sender).mint(a);
		else if (i == 2) IBorrowable(msg.sender).redeem(a);
		else if (i == 3) IBorrowable(msg.sender).skim(a);
		else if (i == 4) IBorrowable(msg.sender).sync();
		else if (i == 5) IBorrowable(msg.sender).borrow(a, a, 0, new bytes(0));
		else if (i == 6) IBorrowable(msg.sender).liquidate(a, a, 0, new bytes(0));
		else if (i == 7) IBorrowable(msg.sender).underlying();
	}
	
}