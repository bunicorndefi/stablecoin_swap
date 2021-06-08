// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.6.12;

import "./IBuniCornRouter01.sol";

interface IBuniCornRouter02 is IBuniCornRouter01 {
    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata poolsPath,
        IERC20[] calldata path,
        address to,
        uint256 deadline
    ) external;
}
