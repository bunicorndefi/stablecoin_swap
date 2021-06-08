// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "../interfaces/IBuniCornFactory.sol";
import "../interfaces/IBuniCornRouter02.sol";
import "../interfaces/IERC20Permit.sol";
import "../interfaces/IBuniCornPool.sol";
import "../libraries/BuniCornLibrary.sol";

contract BuniCornRouter02 is Ownable, IBuniCornRouter02 {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    uint256 internal constant BPS = 10000;
    uint256 internal constant MIN_VRESERVE_RATIO = 0;
    uint256 internal constant MAX_VRESERVE_RATIO = 2**256 - 1;
    uint256 internal constant Q112 = 2**112;

    address public immutable override factory;

    modifier ensure(uint256 deadline) {
        require(deadline >= block.timestamp, "BUNIROUTER: EXPIRED");
        _;
    }

    constructor(address _factory) public {
        factory = _factory;
    }

    // **** ADD LIQUIDITY ****
    function _addLiquidity(
        IERC20 tokenA,
        IERC20 tokenB,
        address pool,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        uint256[2] memory vReserveRatioBounds
    ) internal virtual view returns (uint256 amountA, uint256 amountB) {
        (uint256 reserveA, uint256 reserveB, uint256 vReserveA, uint256 vReserveB, ) = BuniCornLibrary
            .getTradeInfo(pool, tokenA, tokenB);
        if (reserveA == 0 && reserveB == 0) {
            (amountA, amountB) = (amountADesired, amountBDesired);
        } else {
            uint256 amountBOptimal = BuniCornLibrary.quote(amountADesired, reserveA, reserveB);
            if (amountBOptimal <= amountBDesired) {
                require(amountBOptimal >= amountBMin, "BUNIROUTER: INSUFFICIENT_B_AMOUNT");
                (amountA, amountB) = (amountADesired, amountBOptimal);
            } else {
                uint256 amountAOptimal = BuniCornLibrary.quote(amountBDesired, reserveB, reserveA);
                assert(amountAOptimal <= amountADesired);
                require(amountAOptimal >= amountAMin, "BUNIROUTER: INSUFFICIENT_A_AMOUNT");
                (amountA, amountB) = (amountAOptimal, amountBDesired);
            }
            uint256 currentRate = (vReserveB * Q112) / vReserveA;
            require(
                currentRate >= vReserveRatioBounds[0] && currentRate <= vReserveRatioBounds[1],
                "BUNIROUTER: OUT_OF_BOUNDS_VRESERVE"
            );
        }
    }

    function addLiquidity(
        IERC20 tokenA,
        IERC20 tokenB,
        address pool,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        uint256[2] memory vReserveRatioBounds,
        address to,
        uint256 deadline
    )
        public
        virtual
        override
        ensure(deadline)
        returns (
            uint256 amountA,
            uint256 amountB,
            uint256 liquidity
        )
    {
        verifyPoolAddress(tokenA, tokenB, pool);
        (amountA, amountB) = _addLiquidity(
            tokenA,
            tokenB,
            pool,
            amountADesired,
            amountBDesired,
            amountAMin,
            amountBMin,
            vReserveRatioBounds
        );
        // using tokenA.safeTransferFrom will get "Stack too deep"
        SafeERC20.safeTransferFrom(tokenA, msg.sender, pool, amountA);
        SafeERC20.safeTransferFrom(tokenB, msg.sender, pool, amountB);
        liquidity = IBuniCornPool(pool).mint(to);
    }

    // *notes*: only allow the contract owner to create new pool
    function addLiquidityNewPool(
        IERC20 tokenA,
        IERC20 tokenB,
        uint32 ampBps,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    )
        external
        override
        onlyOwner
        returns (
            uint256 amountA,
            uint256 amountB,
            uint256 liquidity
        )
    {
        address pool;
        if (ampBps == BPS) {
            pool = IBuniCornFactory(factory).getUnamplifiedPool(tokenA, tokenB);
        }
        if (pool == address(0)) {
            pool = IBuniCornFactory(factory).createPool(tokenA, tokenB, ampBps);
        }
        // if we add liquidity to an existing pool, this is an unamplifed pool
        // so there is no need for bounds of virtual reserve ratio
        uint256[2] memory vReserveRatioBounds = [MIN_VRESERVE_RATIO, MAX_VRESERVE_RATIO];
        (amountA, amountB, liquidity) = addLiquidity(
            tokenA,
            tokenB,
            pool,
            amountADesired,
            amountBDesired,
            amountAMin,
            amountBMin,
            vReserveRatioBounds,
            to,
            deadline
        );
    }

    // **** REMOVE LIQUIDITY ****
    function removeLiquidity(
        IERC20 tokenA,
        IERC20 tokenB,
        address pool,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) public override ensure(deadline) returns (uint256 amountA, uint256 amountB) {
        verifyPoolAddress(tokenA, tokenB, pool);
        IERC20(pool).safeTransferFrom(msg.sender, pool, liquidity); // send liquidity to pool
        (uint256 amount0, uint256 amount1) = IBuniCornPool(pool).burn(to);
        (IERC20 token0, ) = BuniCornLibrary.sortTokens(tokenA, tokenB);
        (amountA, amountB) = tokenA == token0 ? (amount0, amount1) : (amount1, amount0);
        require(amountA >= amountAMin, "BUNIROUTER: INSUFFICIENT_A_AMOUNT");
        require(amountB >= amountBMin, "BUNIROUTER: INSUFFICIENT_B_AMOUNT");
    }

    function removeLiquidityWithPermit(
        IERC20 tokenA,
        IERC20 tokenB,
        address pool,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline,
        bool approveMax,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external virtual override returns (uint256 amountA, uint256 amountB) {
        uint256 value = approveMax ? uint256(-1) : liquidity;
        IERC20Permit(pool).permit(msg.sender, address(this), value, deadline, v, r, s);
        (amountA, amountB) = removeLiquidity(
            tokenA,
            tokenB,
            pool,
            liquidity,
            amountAMin,
            amountBMin,
            to,
            deadline
        );
    }

    // **** SWAP ****
    // requires the initial amount to have already been sent to the first pool
    function _swap(
        uint256[] memory amounts,
        address[] memory poolsPath,
        IERC20[] memory path,
        address _to
    ) private {
        for (uint256 i; i < path.length - 1; i++) {
            (IERC20 input, IERC20 output) = (path[i], path[i + 1]);
            (IERC20 token0, ) = BuniCornLibrary.sortTokens(input, output);
            uint256 amountOut = amounts[i + 1];
            (uint256 amount0Out, uint256 amount1Out) = input == token0
                ? (uint256(0), amountOut)
                : (amountOut, uint256(0));
            address to = i < path.length - 2 ? poolsPath[i + 1] : _to;
            IBuniCornPool(poolsPath[i]).swap(amount0Out, amount1Out, to, new bytes(0));
        }
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] memory poolsPath,
        IERC20[] memory path,
        address to,
        uint256 deadline
    ) public virtual override ensure(deadline) returns (uint256[] memory amounts) {
        verifyPoolsPathSwap(poolsPath, path);
        amounts = BuniCornLibrary.getAmountsOut(amountIn, poolsPath, path);
        require(
            amounts[amounts.length - 1] >= amountOutMin,
            "BUNIROUTER: INSUFFICIENT_OUTPUT_AMOUNT"
        );
        IERC20(path[0]).safeTransferFrom(msg.sender, poolsPath[0], amounts[0]);
        _swap(amounts, poolsPath, path, to);
    }

    function swapTokensForExactTokens(
        uint256 amountOut,
        uint256 amountInMax,
        address[] memory poolsPath,
        IERC20[] memory path,
        address to,
        uint256 deadline
    ) public override ensure(deadline) returns (uint256[] memory amounts) {
        verifyPoolsPathSwap(poolsPath, path);
        amounts = BuniCornLibrary.getAmountsIn(amountOut, poolsPath, path);
        require(amounts[0] <= amountInMax, "BUNIROUTER: EXCESSIVE_INPUT_AMOUNT");
        path[0].safeTransferFrom(msg.sender, poolsPath[0], amounts[0]);
        _swap(amounts, poolsPath, path, to);
    }

    // **** SWAP (supporting fee-on-transfer tokens) ****
    // requires the initial amount to have already been sent to the first pool
    function _swapSupportingFeeOnTransferTokens(
        address[] memory poolsPath,
        IERC20[] memory path,
        address _to
    ) internal {
        verifyPoolsPathSwap(poolsPath, path);
        for (uint256 i; i < path.length - 1; i++) {
            (IERC20 input, IERC20 output) = (path[i], path[i + 1]);
            (IERC20 token0, ) = BuniCornLibrary.sortTokens(input, output);
            IBuniCornPool pool = IBuniCornPool(poolsPath[i]);
            uint256 amountOutput;
            {
                // scope to avoid stack too deep errors
                (
                    uint256 reserveIn,
                    uint256 reserveOut,
                    uint256 vReserveIn,
                    uint256 vReserveOut,
                    uint256 feeInPrecision
                ) = BuniCornLibrary.getTradeInfo(poolsPath[i], input, output);
                uint256 amountInput = IERC20(input).balanceOf(address(pool)).sub(reserveIn);
                amountOutput = BuniCornLibrary.getAmountOut(
                    amountInput,
                    reserveIn,
                    reserveOut,
                    vReserveIn,
                    vReserveOut,
                    feeInPrecision
                );
            }
            (uint256 amount0Out, uint256 amount1Out) = input == token0
                ? (uint256(0), amountOutput)
                : (amountOutput, uint256(0));
            address to = i < path.length - 2 ? poolsPath[i + 1] : _to;
            pool.swap(amount0Out, amount1Out, to, new bytes(0));
        }
    }

    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] memory poolsPath,
        IERC20[] memory path,
        address to,
        uint256 deadline
    ) public override ensure(deadline) {
        path[0].safeTransferFrom(msg.sender, poolsPath[0], amountIn);
        uint256 balanceBefore = path[path.length - 1].balanceOf(to);
        _swapSupportingFeeOnTransferTokens(poolsPath, path, to);
        uint256 balanceAfter = path[path.length - 1].balanceOf(to);
        require(
            balanceAfter >= balanceBefore.add(amountOutMin),
            "BUNIROUTER: INSUFFICIENT_OUTPUT_AMOUNT"
        );
    }

    // **** LIBRARY FUNCTIONS ****

    /// @dev get the amount of tokenB for adding liquidity with given amount of token A and the amount of tokens in the pool
    function quote(
        uint256 amountA,
        uint256 reserveA,
        uint256 reserveB
    ) external override pure returns (uint256 amountB) {
        return BuniCornLibrary.quote(amountA, reserveA, reserveB);
    }

    function getAmountsOut(
        uint256 amountIn,
        address[] calldata poolsPath,
        IERC20[] calldata path
    ) external override view returns (uint256[] memory amounts) {
        verifyPoolsPathSwap(poolsPath, path);
        return BuniCornLibrary.getAmountsOut(amountIn, poolsPath, path);
    }

    function getAmountsIn(
        uint256 amountOut,
        address[] calldata poolsPath,
        IERC20[] calldata path
    ) external override view returns (uint256[] memory amounts) {
        verifyPoolsPathSwap(poolsPath, path);
        return BuniCornLibrary.getAmountsIn(amountOut, poolsPath, path);
    }

    function verifyPoolsPathSwap(address[] memory poolsPath, IERC20[] memory path) internal view {
        require(path.length >= 2, "BUNIROUTER: INVALID_PATH");
        require(poolsPath.length == path.length - 1, "BUNIROUTER: INVALID_POOLS_PATH");
        for (uint256 i = 0; i < poolsPath.length; i++) {
            verifyPoolAddress(path[i], path[i + 1], poolsPath[i]);
        }
    }

    function verifyPoolAddress(
        IERC20 tokenA,
        IERC20 tokenB,
        address pool
    ) internal view {
        require(IBuniCornFactory(factory).isPool(tokenA, tokenB, pool), "BUNIROUTER: INVALID_POOL");
    }
}
