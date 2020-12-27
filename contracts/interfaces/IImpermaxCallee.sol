pragma solidity >=0.5.0;

interface IImpermaxCallee {
    function impermaxBorrow(address sender, address borrower, uint borrowAmount, bytes calldata data) external;
    function impermaxLiquidate(address sender, address borrower, uint repayAmount, bytes calldata data) external;
}