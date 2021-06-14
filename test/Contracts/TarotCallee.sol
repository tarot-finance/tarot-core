pragma solidity =0.5.16;

import "../../contracts/interfaces/ITarotCallee.sol";
import "./Recipient.sol";

contract TarotCallee is ITarotCallee {
    address recipient;
    address underlying;

    constructor(address _recipient, address _underlying) public {
        recipient = _recipient;
        underlying = _underlying;
    }

    function tarotBorrow(
        address sender,
        address borrower,
        uint256 borrowAmount,
        bytes calldata data
    ) external {
        sender;
        borrower;
        borrowAmount;
        data;
        Recipient(recipient).empty(underlying, msg.sender);
    }

    function tarotRedeem(
        address sender,
        uint256 redeemAmount,
        bytes calldata data
    ) external {
        sender;
        redeemAmount;
        data;
        Recipient(recipient).empty(underlying, msg.sender);
    }
}
