// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.6.12;

interface IBuniCornCallee {
    function buniSwapCall(
        address sender,
        uint256 amount0,
        uint256 amount1,
        bytes calldata data
    ) external;
}
