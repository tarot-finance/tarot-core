### Impermax x Uniswap V2 Core

In order to understand the scope of this project and how it works I suggest the following readings:
- [Impermax x Uniswap V2 Whitepaper](https://impermax.finance/Whitepaper-Impermax-UniswapV2.pdf "Impermax x Uniswap V2 Whitepaper"): this document explains the scope and the components of this project from a high level perspective.
- [UniswapV2 Whitepaper](https://uniswap.org/whitepaper.pdf "UniswapV2 Whitepaper"): this document explains some design choices made while implementing UniswapV2. Many of those choices have been reused in this project, in particular:
	- The core and periphery architecture (the periphery is currently under developement);
	- In functions such as `mint()`, `redeem()`, `borrow()` and `liquidate()` the tokens must be transferred to the contract before the function is called;
	- We have reused the design pattern used in Uniswap function `swap()` that enables flash swaps in our functions `borrow()` and `liquidate()` in order to enable flash borrows and flash liquidations;
	- We have implemented meta transactions with the functions `permit()` and `borrowPermit()`;
	- Functions `sync()` and `skim()`;
	- Burning  `MINIMUM_LIQUIDITY` when minting for the first time;
	- The core doesnt directly support ETH, but only ERC20 tokens such as WETH;
	- We have used the same factory pattern and the opcode `CREATE2` for deploying contracts;

Currently we dont have a documentation for this project. Here are some other quick facts that are important in order to understand some design choices. If you need more informations Im happy to give them to you simone@impermax.finance.
- The `borrow()` function enable users to also repay a loan by sending tokens to the contract before calling the function;
- The price oracle used is [Simple Uniswap Oracle](https://github.com/Impermax-Finance/simple-uniswap-oracle "Simple Uniswap Oracle");
- There is a protocol fee that can be set through the `reserveFactor` parameter. Such fee is distributed to the `reserveManager` by minting new tokens each time that the function `exchangeRate()` of a Borrowable is called and the exchange rate has grown in comparison to the previous time;
- We commonly use 1e18 as denom in order to represent floating point parameters;
- As a convention "amount" always refers to quantity in underlying tokens while "tokens" refers to quantity in contract tokens.

### Contracts architecture
![enter image description here](https://i.imgur.com/K2wtH3Y.jpg)
