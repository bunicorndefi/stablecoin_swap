const Helper = require('../helper');
const buniHelper = require('../buniHelper');
const BN = web3.utils.BN;

const {precisionUnits, MINIMUM_LIQUIDITY} = require('../helper');
const {expectEvent, expectRevert, time} = require('@openzeppelin/test-helpers');
const {ecsign} = require('ethereumjs-util');

const BuniCornRouter = artifacts.require('BuniCornRouter02');
const BuniCornFactory = artifacts.require('BuniCornFactory');
const BuniCornPool = artifacts.require('BuniCornPool');
const TestToken = artifacts.require('TestToken');

const bigAmount = new BN(2).pow(new BN(250));

let owner;
let trader;
let feeToSetter;
let feeTo;
let liquidityProvider;
let liquidityProviderPkKey;
let app;
let factory;
let token0;
let token1;

let router;
let pool;
let initTokenAmount = Helper.expandTo18Decimals(1000);
const BNOne = new BN(1);
const MaxUint256 = new BN(2).pow(new BN(256)).sub(BNOne);

contract('BuniCornRouter', function (accounts) {
  before('setup', async () => {
    owner = accounts[0];
    feeToSetter = accounts[1];
    trader = accounts[2];
    app = accounts[3];
    liquidityProvider = accounts[4];
    // key from hardhat.config.js
    liquidityProviderPkKey = '0x87630b2d1de0fbd5044eb6891b3d9d98c34c8d310c852f98550ba774480e47cc';
    feeTo = accounts[5];

    let tokenA = await TestToken.new('test token A', 'A', Helper.expandTo18Decimals(100000));
    let tokenB = await TestToken.new('test token B', 'B', Helper.expandTo18Decimals(100000));
    tokenA.transfer(trader, initTokenAmount);
    tokenB.transfer(trader, initTokenAmount);
    [token0, token1] = new BN(tokenA.address).lt(new BN(tokenB.address)) ? [tokenA, tokenB] : [tokenB, tokenA];
  });

  beforeEach('setup', async () => {
    factory = await BuniCornFactory.new(feeToSetter);
    /// create pool tokenA and tokenB
    await factory.createPool(token0.address, token1.address, new BN(10000));
    const poolAddrs = await factory.getPools(token0.address, token1.address);
    pool = await BuniCornPool.at(poolAddrs[0]);
    /// create router
    router = await BuniCornRouter.new(factory.address, { from: owner });
    await factory.setRouter(router.address, { from: owner });
  });

  it('factory', async () => {
    Helper.assertEqual(await router.factory(), factory.address);
  });

  describe('addLiquidity', async () => {
    it('addLiquidityNewPool', async () => {
      let tokenA = await TestToken.new('test token A', 'A', Helper.expandTo18Decimals(10000));
      let tokenB = await TestToken.new('test token B', 'B', Helper.expandTo18Decimals(10000));
      // tokenA.transfer(trader, initTokenAmount);
      // tokenB.transfer(trader, initTokenAmount);

      await tokenA.approve(router.address, bigAmount, {from: owner});
      await tokenB.approve(router.address, bigAmount, {from: owner});

      const tokenAAmount = Helper.expandTo18Decimals(1);
      const tokenBAmount = Helper.expandTo18Decimals(4);

      await expectRevert(
        router.addLiquidityNewPool(
          tokenA.address,
          tokenB.address,
          new BN(20000),
          tokenAAmount,
          tokenBAmount,
          0,
          0,
          liquidityProvider,
          bigAmount,
          {from: trader}
        ),
        'Ownable: caller is not the owner'
      );

      // amp-pool
      let result = await router.addLiquidityNewPool(
        tokenA.address,
        tokenB.address,
        new BN(20000),
        tokenAAmount,
        tokenBAmount,
        0,
        0,
        liquidityProvider,
        bigAmount,
        {from: owner}
      );
      let poolAddresses = await factory.getPools(tokenA.address, tokenB.address);
      let pool = await BuniCornPool.at(poolAddresses[0]);
      const token0Address = await pool.token0();
      console.log('gas used', result.receipt.gasUsed);
      await expectEvent.inTransaction(result.tx, pool, 'Sync', {
        reserve0: tokenA.address == token0Address ? tokenAAmount : tokenBAmount,
        reserve1: tokenA.address == token0Address ? tokenBAmount : tokenAAmount
      });
      const expectedLiquidity = Helper.sqrt(tokenAAmount.mul(tokenBAmount)).sub(MINIMUM_LIQUIDITY);
      Helper.assertEqual(await pool.balanceOf(liquidityProvider), expectedLiquidity, 'unexpected liquidity');

      // unamplified pool
      result = await router.addLiquidityNewPool(
        tokenB.address,
        tokenA.address,
        new BN(10000),
        tokenBAmount,
        tokenAAmount,
        0,
        0,
        liquidityProvider,
        bigAmount,
        {from: owner}
      );
      poolAddresses = await factory.getPools(tokenA.address, tokenB.address);
      pool = await BuniCornPool.at(poolAddresses[1]);
      await expectEvent.inTransaction(result.tx, pool, 'Sync', {
        reserve0: tokenA.address == token0Address ? tokenAAmount : tokenBAmount,
        reserve1: tokenA.address == token0Address ? tokenBAmount : tokenAAmount
      });
      Helper.assertEqual(await pool.balanceOf(liquidityProvider), expectedLiquidity, 'unexpected liquidity');
      // addliquidity for unamplified again
      result = await router.addLiquidityNewPool(
        tokenB.address,
        tokenA.address,
        new BN(10000),
        tokenBAmount,
        tokenAAmount,
        0,
        0,
        liquidityProvider,
        bigAmount,
        {from: owner}
      );
      poolAddresses = await factory.getPools(tokenA.address, tokenB.address);
      Helper.assertEqual(poolAddresses.length, 2);
    });

    it('addLiquidity', async () => {
      const token0Amount = Helper.expandTo18Decimals(1);
      const token1Amount = Helper.expandTo18Decimals(4);

      await token0.approve(router.address, bigAmount, {from: trader});
      await token1.approve(router.address, bigAmount, {from: trader});

      let vReserveRatio = token1Amount.mul(Helper.Q112).div(token0Amount);
      // add liquidity to a pool without any reserves
      let result = await router.addLiquidity(
        token0.address,
        token1.address,
        pool.address,
        token0Amount,
        token1Amount,
        0,
        0,
        [vReserveRatio, vReserveRatio],
        trader,
        bigAmount,
        {from: trader}
      );
      console.log('gas used', result.receipt.gasUsed);
      await expectEvent.inTransaction(result.tx, pool, 'Sync', {
        reserve0: token0Amount,
        reserve1: token1Amount
      });
      await expectEvent.inTransaction(result.tx, pool, 'Mint', {
        sender: router.address,
        amount0: token0Amount,
        amount1: token1Amount
      });
      // when call add Liquidity, the router will add token to the pool with the current ratio
      let updateAmount = Helper.expandTo18Decimals(2);
      let expectedToken0Amount = Helper.expandTo18Decimals(1).div(new BN(2));
      Helper.assertEqual(await router.quote(updateAmount, token1Amount, token0Amount), expectedToken0Amount);

      await expectRevert(
        router.addLiquidity(
          token0.address,
          token1.address,
          pool.address,
          Helper.expandTo18Decimals(2),
          Helper.expandTo18Decimals(2),
          expectedToken0Amount.add(new BN(1)),
          0,
          [vReserveRatio, vReserveRatio],
          trader,
          bigAmount,
          {from: trader}
        ),
        'BUNIROUTER: INSUFFICIENT_A_AMOUNT'
      );

      await expectRevert(
        router.addLiquidity(
          token1.address,
          token0.address,
          pool.address,
          updateAmount,
          updateAmount,
          0,
          expectedToken0Amount.add(new BN(1)),
          [vReserveRatio, vReserveRatio],
          trader,
          bigAmount,
          {from: trader}
        ),
        'BUNIROUTER: INSUFFICIENT_B_AMOUNT'
      );

      await expectRevert(
        router.addLiquidity(
          token1.address,
          token0.address,
          pool.address,
          updateAmount,
          updateAmount,
          0,
          0,
          [vReserveRatio.add(new BN(1)), vReserveRatio.add(new BN(1))],
          trader,
          bigAmount,
          {from: trader}
        ),
        'BUNIROUTER: OUT_OF_BOUNDS_VRESERVE'
      );

      await expectRevert(
        router.addLiquidity(
          token1.address,
          token0.address,
          pool.address,
          updateAmount,
          updateAmount,
          0,
          0,
          [vReserveRatio.sub(new BN(1)), vReserveRatio.sub(new BN(1))],
          trader,
          bigAmount,
          {from: trader}
        ),
        'BUNIROUTER: OUT_OF_BOUNDS_VRESERVE'
      );

      result = await router.addLiquidity(
        token0.address,
        token1.address,
        pool.address,
        updateAmount,
        updateAmount,
        0,
        0,
        [vReserveRatio, vReserveRatio],
        trader,
        bigAmount,
        {from: trader}
      );
      await expectEvent.inTransaction(result.tx, pool, 'Mint', {
        sender: router.address,
        amount0: expectedToken0Amount,
        amount1: updateAmount
      });

      // similar test with token 1
      updateAmount = Helper.expandTo18Decimals(1);
      let expectedToken1Amount = Helper.expandTo18Decimals(4);
      Helper.assertEqual(await router.quote(updateAmount, token0Amount, token1Amount), expectedToken1Amount);

      vReserveRatio = token0Amount.mul(Helper.Q112).div(token1Amount);
      result = await router.addLiquidity(
        token1.address,
        token0.address,
        pool.address,
        Helper.expandTo18Decimals(5),
        updateAmount,
        0,
        0,
        [vReserveRatio, vReserveRatio],
        trader,
        bigAmount,
        {from: trader}
      );
      await expectEvent.inTransaction(result.tx, pool, 'Mint', {
        sender: router.address,
        amount0: updateAmount,
        amount1: expectedToken1Amount
      });
    });
  });

  it('removeLiquidity', async () => {
    const token0Amount = Helper.expandTo18Decimals(1);
    const token1Amount = Helper.expandTo18Decimals(4);
    await token0.transfer(pool.address, token0Amount, {from: trader});
    await token1.transfer(pool.address, token1Amount, {from: trader});
    await pool.mint(trader);

    const expectedLiquidity = Helper.expandTo18Decimals(2);
    await pool.approve(router.address, bigAmount, {from: trader});
    // revert if amount is smaller than amountMin
    await expectRevert(
      router.removeLiquidity(
        token0.address,
        token1.address,
        pool.address,
        expectedLiquidity.sub(MINIMUM_LIQUIDITY),
        token0Amount.sub(new BN(499)),
        0,
        trader,
        bigAmount,
        {from: trader}
      ),
      'BUNIROUTER: INSUFFICIENT_A_AMOUNT'
    );

    await expectRevert(
      router.removeLiquidity(
        token1.address,
        token0.address,
        pool.address,
        expectedLiquidity.sub(MINIMUM_LIQUIDITY),
        0,
        token0Amount.sub(new BN(499)),
        trader,
        bigAmount,
        {from: trader}
      ),
      'BUNIROUTER: INSUFFICIENT_B_AMOUNT'
    );

    await expectRevert(
      router.removeLiquidity(
        token0.address,
        token1.address,
        pool.address,
        expectedLiquidity.sub(MINIMUM_LIQUIDITY),
        0,
        token1Amount.sub(new BN(1999)),
        trader,
        bigAmount,
        {from: trader}
      ),
      'BUNIROUTER: INSUFFICIENT_B_AMOUNT'
    );

    let result = await router.removeLiquidity(
      token0.address,
      token1.address,
      pool.address,
      expectedLiquidity.sub(MINIMUM_LIQUIDITY),
      0,
      0,
      trader,
      bigAmount,
      {from: trader}
    );
    console.log('gas used', result.receipt.gasUsed);
    await expectEvent.inTransaction(result.tx, pool, 'Sync', {
      reserve0: new BN(500),
      reserve1: new BN(2000)
    });
    await expectEvent.inTransaction(result.tx, pool, 'Burn', {
      sender: router.address,
      amount0: token0Amount.sub(new BN(500)),
      amount1: token1Amount.sub(new BN(2000)),
      to: trader
    });

    Helper.assertEqual(await pool.balanceOf(trader), new BN(0));
    Helper.assertEqual(await token0.balanceOf(trader), initTokenAmount.sub(new BN(500)));
    Helper.assertEqual(await token1.balanceOf(trader), initTokenAmount.sub(new BN(2000)));
  });

  it('removeLiquidityWithPermit', async () => {
    const token0Amount = Helper.expandTo18Decimals(1);
    const token1Amount = Helper.expandTo18Decimals(4);
    await token0.transfer(pool.address, token0Amount, {from: trader});
    await token1.transfer(pool.address, token1Amount, {from: trader});
    await pool.mint(liquidityProvider);
    const expectedLiquidity = Helper.expandTo18Decimals(2);

    let nonce = await pool.nonces(liquidityProvider);
    let digest = await Helper.getApprovalDigest(
      pool,
      liquidityProvider,
      router.address,
      expectedLiquidity.sub(MINIMUM_LIQUIDITY),
      nonce,
      MaxUint256
    );
    let signature = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(liquidityProviderPkKey.slice(2), 'hex'));

    const beforeBalance0 = await token0.balanceOf(liquidityProvider);
    const beforeBalance1 = await token1.balanceOf(liquidityProvider);
    let result = await router.removeLiquidityWithPermit(
      token0.address,
      token1.address,
      pool.address,
      expectedLiquidity.sub(MINIMUM_LIQUIDITY),
      0,
      0,
      liquidityProvider,
      MaxUint256, /// deadline
      false, /// approveMax
      signature.v,
      signature.r,
      signature.s,
      {from: liquidityProvider}
    );
    console.log('gas used', result.receipt.gasUsed);
    await expectEvent.inTransaction(result.tx, pool, 'Sync', {
      reserve0: new BN(500),
      reserve1: new BN(2000)
    });
    await expectEvent.inTransaction(result.tx, pool, 'Burn', {
      sender: router.address,
      amount0: token0Amount.sub(new BN(500)),
      amount1: token1Amount.sub(new BN(2000)),
      to: liquidityProvider
    });

    Helper.assertEqual(await pool.nonces(liquidityProvider), new BN(1));
    Helper.assertEqual(await pool.balanceOf(liquidityProvider), new BN(0));
    Helper.assertEqual(await token0.balanceOf(liquidityProvider), beforeBalance0.add(token0Amount).sub(new BN(500)));
    Helper.assertEqual(await token1.balanceOf(liquidityProvider), beforeBalance1.add(token1Amount).sub(new BN(2000)));

    // test remove liquidity with approve max
    await token0.transfer(pool.address, token0Amount, {from: trader});
    await token1.transfer(pool.address, token1Amount, {from: trader});
    await pool.mint(liquidityProvider);

    let liquidity = await pool.balanceOf(liquidityProvider);

    nonce = await pool.nonces(liquidityProvider);
    digest = await Helper.getApprovalDigest(pool, liquidityProvider, router.address, MaxUint256, nonce, MaxUint256);

    signature = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(liquidityProviderPkKey.slice(2), 'hex'));

    await router.removeLiquidityWithPermit(
      token0.address,
      token1.address,
      pool.address,
      liquidity,
      0,
      0,
      liquidityProvider,
      MaxUint256, /// deadline
      true, /// approveMax
      signature.v,
      signature.r,
      signature.s,
      {from: liquidityProvider}
    );
  });

  describe('test query rate function', async () => {
    it('getAmountOut', async () => {
      let [factory, pool] = await setupPool(feeToSetter, token0, token1, new BN(20000));
      let router = await BuniCornRouter.new(factory.address);
      const token0Amount = Helper.expandTo18Decimals(5);
      const token1Amount = Helper.expandTo18Decimals(10);
      const swapAmount = Helper.expandTo18Decimals(1);
      const poolsPath = [pool.address];
      const path = [token0.address, token1.address];
      // revert if invalid path.length
      await expectRevert(router.getAmountsOut(swapAmount, poolsPath, [token0.address]), 'BUNIROUTER: INVALID_PATH');

      // revert if there is no liquidity
      await expectRevert(router.getAmountsOut(swapAmount, poolsPath, path), 'BUNILIB: INSUFFICIENT_LIQUIDITY');

      await addLiquidity(liquidityProvider, pool, token0, token1, token0Amount, token1Amount);
      // revert if amountOut == 0
      await expectRevert(router.getAmountsOut(new BN(0), poolsPath, path), 'BUNILIB: INSUFFICIENT_INPUT_AMOUNT');

      // test revert amount in
      let amounts = await router.getAmountsOut(swapAmount, poolsPath, path);
      const amountOut = amounts[amounts.length - 1];
      amounts = await router.getAmountsIn(amountOut.add(new BN(1)), poolsPath, path);
      Helper.assertLesser(swapAmount, amounts[0]);
      amounts = await router.getAmountsIn(amountOut, poolsPath, path);
      Helper.assertEqual(swapAmount, amounts[0]);

      // special case virtual balance is not enough for trade
      let bigAmountIn = await buniHelper.getAmountIn(token1Amount, token0, pool);
      await expectRevert(router.getAmountsOut(bigAmountIn, poolsPath, path), 'BUNILIB: INSUFFICIENT_LIQUIDITY');
      bigAmountIn = await buniHelper.getAmountIn(token1Amount.sub(new BN(1)), token0, pool);
      amounts = await router.getAmountsOut(bigAmountIn, poolsPath, path);

      await token0.approve(router.address, bigAmountIn, {from: trader});
      await router.swapExactTokensForTokens(
        bigAmountIn,
        amounts[amounts.length - 1],
        poolsPath,
        path,
        trader,
        Helper.MaxUint256,
        {from: trader}
      );
    });

    it('getAmountIn', async () => {
      [factory, pool] = await setupPool(feeToSetter, token0, token1, new BN(20000));
      let router = await BuniCornRouter.new(factory.address);
      const token0Amount = Helper.expandTo18Decimals(5);
      const token1Amount = Helper.expandTo18Decimals(10);
      const swapAmount = Helper.expandTo18Decimals(1);
      let poolsPath = [pool.address];
      const path = [token0.address, token1.address];
      // revert if there is no liquidity
      await expectRevert(router.getAmountsIn(swapAmount, poolsPath, path), 'BUNILIB: INSUFFICIENT_LIQUIDITY');

      await addLiquidity(liquidityProvider, pool, token0, token1, token0Amount, token1Amount);
      // revert if amountOut == 0
      await expectRevert(router.getAmountsIn(new BN(0), poolsPath, path), 'BUNILIB: INSUFFICIENT_OUTPUT_AMOUNT');

      // test revert amount in
      let amounts = await router.getAmountsIn(swapAmount, poolsPath, path);
      const amountIn = amounts[0];
      amounts = await router.getAmountsOut(amountIn.sub(new BN(1)), poolsPath, path);
      Helper.assertGreater(swapAmount, amounts[amounts.length - 1]);
      amounts = await router.getAmountsOut(amountIn, poolsPath, path);
      Helper.assertEqual(swapAmount, amounts[amounts.length - 1]);

      // special case real balance is not enough for trade
      await expectRevert(router.getAmountsIn(token1Amount, poolsPath, path), 'BUNILIB: INSUFFICIENT_LIQUIDITY');
      amounts = await router.getAmountsIn(token1Amount.sub(new BN(1)), poolsPath, path);

      await token0.approve(router.address, amounts[0], {from: trader});
      await router.swapTokensForExactTokens(
        token1Amount.sub(new BN(1)),
        amounts[0],
        poolsPath,
        path,
        trader,
        Helper.MaxUint256,
        {from: trader}
      );
    });
  });

  it('swapExactTokensForTokens', async () => {
    const token0Amount = Helper.expandTo18Decimals(5);
    const token1Amount = Helper.expandTo18Decimals(10);
    const swapAmount = Helper.expandTo18Decimals(1);
    const poolsPath = [pool.address];
    const path = [token0.address, token1.address];

    await token0.transfer(pool.address, token0Amount);
    await token1.transfer(pool.address, token1Amount);
    await pool.mint(trader);
    await token0.approve(router.address, bigAmount, {from: trader});

    let amounts = await router.getAmountsOut(swapAmount, poolsPath, path);
    let expectedOutputAmount = amounts[amounts.length - 1];

    const token0Balance = await token0.balanceOf(trader);
    const token1Balance = await token1.balanceOf(trader);

    // revert if amountDesired < amountOut
    await expectRevert(
      router.swapExactTokensForTokens(
        swapAmount,
        expectedOutputAmount.add(new BN(1)),
        poolsPath,
        path,
        trader,
        bigAmount,
        {
          from: trader
        }
      ),
      'BUNIROUTER: INSUFFICIENT_OUTPUT_AMOUNT'
    );

    // revert if over deadline
    let expiredTimeStamp = (await Helper.getCurrentBlockTime()) - 1;
    await expectRevert(
      router.swapExactTokensForTokens(swapAmount, 0, poolsPath, path, trader, expiredTimeStamp, {from: trader}),
      'BUNIROUTER: EXPIRED'
    );

    let result = await router.swapExactTokensForTokens(swapAmount, 0, poolsPath, path, trader, bigAmount, {
      from: trader
    });
    console.log('gas used', result.receipt.gasUsed);

    await expectEvent.inTransaction(result.tx, pool, 'Sync', {
      reserve0: token0Amount.add(swapAmount),
      reserve1: token1Amount.sub(expectedOutputAmount)
    });
    await expectEvent.inTransaction(result.tx, pool, 'Swap', {
      sender: router.address,
      amount0In: swapAmount,
      amount1In: new BN(0),
      amount0Out: new BN(0),
      amount1Out: expectedOutputAmount,
      to: trader
    });

    Helper.assertEqual(await token0.balanceOf(trader), token0Balance.sub(swapAmount));
    Helper.assertEqual(await token1.balanceOf(trader), token1Balance.add(expectedOutputAmount));
  });

  it('swapTokensForExactTokens', async () => {
    const token0Amount = Helper.expandTo18Decimals(5);
    const token1Amount = Helper.expandTo18Decimals(10);
    const outputAmount = Helper.expandTo18Decimals(1);
    const poolsPath = [pool.address];
    const path = [token0.address, token1.address];

    await token0.transfer(pool.address, token0Amount);
    await token1.transfer(pool.address, token1Amount);
    await pool.mint(trader);
    await token0.approve(router.address, bigAmount, {from: trader});

    let amounts = await router.getAmountsIn(outputAmount, poolsPath, path);
    let expectedSwapAmount = amounts[0];

    const token0Balance = await token0.balanceOf(trader);
    const token1Balance = await token1.balanceOf(trader);
    // revert if amountDesired > amountIn
    await expectRevert(
      router.swapTokensForExactTokens(
        outputAmount,
        expectedSwapAmount.sub(new BN(1)),
        poolsPath,
        path,
        trader,
        bigAmount,
        {
          from: trader
        }
      ),
      'BUNIROUTER: EXCESSIVE_INPUT_AMOUNT'
    );
    // revert if over deadline
    let expiredTimeStamp = (await Helper.getCurrentBlockTime()) - 1;
    await expectRevert(
      router.swapTokensForExactTokens(outputAmount, bigAmount, poolsPath, path, trader, expiredTimeStamp, {
        from: trader
      }),
      'BUNIROUTER: EXPIRED'
    );

    let result = await router.swapTokensForExactTokens(outputAmount, bigAmount, poolsPath, path, trader, bigAmount, {
      from: trader
    });

    await expectEvent.inTransaction(result.tx, pool, 'Sync', {
      reserve0: token0Amount.add(expectedSwapAmount),
      reserve1: token1Amount.sub(outputAmount)
    });

    await expectEvent.inTransaction(result.tx, pool, 'Swap', {
      sender: router.address,
      amount0In: expectedSwapAmount,
      amount1In: new BN(0),
      amount0Out: new BN(0),
      amount1Out: outputAmount,
      to: trader
    });

    Helper.assertEqual(await token0.balanceOf(trader), token0Balance.sub(expectedSwapAmount));
    Helper.assertEqual(await token1.balanceOf(trader), token1Balance.add(outputAmount));
  });

  describe('multi path router', async () => {
    it('swapExactTokensForTokens', async () => {
      let token2 = await TestToken.new('test token C', 'C', Helper.expandTo18Decimals(100000));
      token2.transfer(trader, initTokenAmount);

      await factory.createPool(token1.address, token2.address, new BN(20000));
      const poolAddrs = await factory.getPools(token1.address, token2.address);
      let pool2 = await BuniCornPool.at(poolAddrs[0]);
      await token1.transfer(pool2.address, Helper.expandTo18Decimals(15));
      await token2.transfer(pool2.address, Helper.expandTo18Decimals(10));
      await pool2.mint(liquidityProvider);

      await token0.transfer(pool.address, Helper.expandTo18Decimals(5));
      await token1.transfer(pool.address, Helper.expandTo18Decimals(10));
      await pool.mint(liquidityProvider);

      let poolsPath = [pool.address, pool2.address];
      let path = [token0.address, token1.address, token2.address];
      let swapAmount = Helper.expandTo18Decimals(1);
      let amounts = await router.getAmountsOut(swapAmount, poolsPath, path);

      await token0.approve(router.address, swapAmount, {from: trader});
      let balanceBefore = await token2.balanceOf(trader);
      await router.swapExactTokensForTokens(
        swapAmount,
        amounts[amounts.length - 1],
        poolsPath,
        path,
        trader,
        Helper.MaxUint256,
        {from: trader}
      );
      Helper.assertEqual(await token2.balanceOf(trader), balanceBefore.add(amounts[amounts.length - 1]));
    });

    it('swapTokensForExactTokens', async () => {
      let token2 = await TestToken.new('test token C', 'C', Helper.expandTo18Decimals(100000));
      token2.transfer(trader, initTokenAmount);

      await factory.createPool(token1.address, token2.address, new BN(20000));
      const poolAddrs = await factory.getPools(token1.address, token2.address);
      let pool2 = await BuniCornPool.at(poolAddrs[0]);
      await token1.transfer(pool2.address, Helper.expandTo18Decimals(15));
      await token2.transfer(pool2.address, Helper.expandTo18Decimals(10));
      await pool2.mint(liquidityProvider);

      await token0.transfer(pool.address, Helper.expandTo18Decimals(5));
      await token1.transfer(pool.address, Helper.expandTo18Decimals(10));
      await pool.mint(liquidityProvider);

      let poolsPath = [pool.address, pool2.address];
      let path = [token0.address, token1.address, token2.address];
      let swapAmount = Helper.expandTo18Decimals(1);
      let amounts = await router.getAmountsIn(swapAmount, poolsPath, path);

      await token0.approve(router.address, amounts[0], {from: trader});
      let balanceBefore = await token0.balanceOf(trader);
      await router.swapTokensForExactTokens(swapAmount, amounts[0], poolsPath, path, trader, Helper.MaxUint256, {
        from: trader
      });
      Helper.assertEqual(await token0.balanceOf(trader), balanceBefore.sub(amounts[0]));
    });
  });

  describe('special case: token balance > real reserve in the pool', async () => {
    it('addLiquidity', async () => {
      const token0Amount = Helper.expandTo18Decimals(2);
      const token1Amount = Helper.expandTo18Decimals(8);
      // create a new pool
      await factory.createPool(token0.address, token1.address, new BN(20000));
      const poolAddrs = await factory.getPools(token0.address, token1.address);
      let pool = await BuniCornPool.at(poolAddrs[poolAddrs.length - 1]);
      await token0.transfer(pool.address, token0Amount);
      await token1.transfer(pool.address, token1Amount);
      await pool.mint(liquidityProvider);
      // unexpected transfer token to the pool
      await token0.transfer(pool.address, Helper.expandTo18Decimals(4));

      await token0.approve(router.address, token0Amount, {from: trader});
      await token1.approve(router.address, token1Amount, {from: trader});
      const vReserveRatio = token1Amount.mul(Helper.Q112).div(token0Amount);
      await router.addLiquidity(
        token0.address,
        token1.address,
        pool.address,
        token0Amount,
        token1Amount,
        token0Amount,
        token1Amount,
        [vReserveRatio, vReserveRatio],
        trader,
        Helper.MaxUint256,
        {from: trader}
      );
      Helper.assertEqual(await pool.balanceOf(trader), Helper.expandTo18Decimals(4));
    });

    it('swap', async () => {
      const token0Amount = Helper.expandTo18Decimals(2);
      const token1Amount = Helper.expandTo18Decimals(8);
      // create a new pool
      await factory.createPool(token0.address, token1.address, new BN(20000));
      const poolAddrs = await factory.getPools(token0.address, token1.address);
      let pool = await BuniCornPool.at(poolAddrs[poolAddrs.length - 1]);
      await token0.transfer(pool.address, token0Amount);
      await token1.transfer(pool.address, token1Amount);
      await pool.mint(liquidityProvider);
      // unexpected transfer token to the pool
      await token0.transfer(pool.address, Helper.expandTo18Decimals(4));

      await token0.approve(router.address, Helper.MaxUint256, {from: trader});
      await router.swapExactTokensForTokens(
        Helper.expandTo18Decimals(1),
        new BN(0),
        [pool.address],
        [token0.address, token1.address],
        trader,
        Helper.MaxUint256,
        {from: trader}
      );
      // unexpected transfer token to the pool
      await token0.transfer(pool.address, Helper.expandTo18Decimals(4));
      await token1.approve(router.address, Helper.MaxUint256, {from: trader});
      await router.swapExactTokensForTokens(
        Helper.expandTo18Decimals(1),
        new BN(0),
        [pool.address],
        [token1.address, token0.address],
        trader,
        Helper.MaxUint256,
        {from: trader}
      );
    });

    it('removeLiquidity', async () => {
      const token0Amount = Helper.expandTo18Decimals(2);
      const token1Amount = Helper.expandTo18Decimals(8);
      // create a new pool
      await factory.createPool(token0.address, token1.address, new BN(20000));
      const poolAddrs = await factory.getPools(token0.address, token1.address);
      let pool = await BuniCornPool.at(poolAddrs[poolAddrs.length - 1]);
      await token0.transfer(pool.address, token0Amount);
      await token1.transfer(pool.address, token1Amount);
      await pool.mint(liquidityProvider);
      // unexpected transfer token to the pool
      await token0.transfer(pool.address, Helper.expandTo18Decimals(4));

      await pool.approve(router.address, Helper.MaxUint256, {from: liquidityProvider});
      await router.removeLiquidity(
        token0.address,
        token1.address,
        pool.address,
        await pool.balanceOf(liquidityProvider),
        token0Amount.sub(MINIMUM_LIQUIDITY.div(new BN(2))),
        token1Amount.sub(MINIMUM_LIQUIDITY.mul(new BN(2))),
        liquidityProvider,
        Helper.MaxUint256,
        {from: liquidityProvider}
      );
      Helper.assertEqual(await pool.balanceOf(liquidityProvider), new BN(0));
    });
  });
});

async function setupFactory (admin) {
  return await BuniCornFactory.new(admin);
}

async function setupPool (admin, token0, token1, ampBps) {
  const factory = await setupFactory(admin);
  await factory.createPool(token0.address, token1.address, ampBps);

  const poolAddrs = await factory.getPools(token0.address, token1.address);
  const pool = await BuniCornPool.at(poolAddrs[0]);

  return [factory, pool];
}

async function addLiquidity (liquidityProvider, pool, token0, token1, token0Amount, token1Amount) {
  await token0.transfer(pool.address, token0Amount);
  await token1.transfer(pool.address, token1Amount);
  await pool.mint(liquidityProvider);
}
