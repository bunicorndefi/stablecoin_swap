// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./IBuniCornExchangeRouter.sol";
import "./IBuniCornLiquidityRouter.sol";

/// @dev full interface for router
interface IBuniCornRouter01 is IBuniCornExchangeRouter, IBuniCornLiquidityRouter {
    function factory() external pure returns (address);
}
