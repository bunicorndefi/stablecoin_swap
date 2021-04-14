// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.12;

import "../libraries/BuniCornLibrary.sol";

contract MockBuniCornLibrary {
    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut,
        uint256 vReserveIn,
        uint256 vReserveOut,
        uint256 fee
    ) external pure returns (uint256 amountOut) {
        return
            BuniCornLibrary.getAmountOut(amountIn, reserveIn, reserveOut, vReserveIn, vReserveOut, fee);
    }

    function getAmountIn(
        uint256 amountOut,
        uint256 reserveIn,
        uint256 reserveOut,
        uint256 vReserveIn,
        uint256 vReserveOut,
        uint256 fee
    ) external pure returns (uint256 amountIn) {
        return
            BuniCornLibrary.getAmountIn(amountOut, reserveIn, reserveOut, vReserveIn, vReserveOut, fee);
    }

    function sortTokens(IERC20 tokenA, IERC20 tokenB)
        external
        pure
        returns (IERC20 token0, IERC20 token1)
    {
        return BuniCornLibrary.sortTokens(tokenA, tokenB);
    }
}
