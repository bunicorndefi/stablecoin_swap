const Helper = require('../helper');
const {MaxUint256, bnbAddress, expandTo18Decimals, MINIMUM_LIQUIDITY} = require('../helper');
const BN = web3.utils.BN;
const {ecsign} = require('ethereumjs-util');
const expectRevert = require('@openzeppelin/test-helpers/src/expectRevert');

const BuniCornFactory = artifacts.require('BuniCornFactory');
const BuniCornPool = artifacts.require('BuniCornPool');
const FeeToken = artifacts.require('MockFeeOnTransferERC20');
const TestToken = artifacts.require('TestToken');
const WBNB = artifacts.require('WBNB9');

const BuniCornRouter02 = artifacts.require('BuniCornRouter02');

let feeToken;
let normalToken;

let factory;
let pool;
let router;
let wbnb;
let tokenPool;

let feeSetter;
let liquidityProvider;

contract('BuniCornRouter02', accounts => {
  before('set accounts', async () => {
    feeSetter = accounts[0];
    liquidityProvider = accounts[3];
    // key from hardhat.config.js
    liquidityProviderPkKey = '0xee9d129c1997549ee09c0757af5939b2483d80ad649a0eda68e8b0357ad11131';
    trader = accounts[2];
    wbnb = await WBNB.new();
  });

  beforeEach(' setup factory and router', async () => {
    feeToken = await FeeToken.new('feeOnTransfer Token', 'FOT', expandTo18Decimals(100000));
    normalToken = await TestToken.new('test', 't1', expandTo18Decimals(100000));

    factory = await BuniCornFactory.new(feeSetter);
    router = await BuniCornRouter02.new(factory.address, wbnb.address);
    // make a DTT<>WBNB pool
    await factory.createPool(feeToken.address, wbnb.address, new BN(10000));
    const poolAddresses = await factory.getPools(feeToken.address, wbnb.address);
    pool = await BuniCornPool.at(poolAddresses[0]);
  });

  afterEach(async function () {
    Helper.assertEqual(await Helper.getBalancePromise(router.address), new BN(0));
  });

  async function addLiquidity (feeTokenAmount, bnbAmount, liquidityProvider) {
    await feeToken.approve(router.address, MaxUint256);
    await router.addLiquidityBNB(
      feeToken.address,
      pool.address,
      feeTokenAmount,
      feeTokenAmount,
      bnbAmount,
      liquidityProvider,
      MaxUint256,
      {
        value: bnbAmount
      }
    );
  }

  it('removeLiquidityBNBSupportingFeeOnTransferTokens', async () => {
    let feeTokenAmount = expandTo18Decimals(1);
    let bnbAmount = expandTo18Decimals(4);
    await addLiquidity(feeTokenAmount, bnbAmount, liquidityProvider);
    feeTokenAmount = await feeToken.balanceOf(pool.address);

    const liquidity = await pool.balanceOf(liquidityProvider);
    const totalSupply = await pool.totalSupply();
    const feeTokenExpected = feeTokenAmount.mul(liquidity).div(totalSupply);
    const bnbExpected = bnbAmount.mul(liquidity).div(totalSupply);

    await pool.approve(router.address, MaxUint256, {from: liquidityProvider});
    await router.removeLiquidityBNBSupportingFeeOnTransferTokens(
      feeToken.address,
      pool.address,
      liquidity,
      feeTokenExpected,
      bnbExpected,
      liquidityProvider,
      MaxUint256,
      {
        from: liquidityProvider
      }
    );
  });

  // BNB -> DTT
  it('swapExactBNBForTokensSupportingFeeOnTransferTokens', async () => {
    const feeTokenAmount = expandTo18Decimals(10)
      .mul(new BN(100))
      .div(new BN(99));
    const bnbAmount = expandTo18Decimals(5);
    const swapAmount = expandTo18Decimals(1);
    const poolsPath = [pool.address];
    const path = [wbnb.address, feeToken.address];
    await addLiquidity(feeTokenAmount, bnbAmount, liquidityProvider);

    await expectRevert(
      router.swapExactBNBForTokensSupportingFeeOnTransferTokens(
        0,
        [pool.address],
        [normalToken.address, feeToken.address],
        trader,
        MaxUint256,
        {
          from: trader,
          value: swapAmount
        }
      ),
      'BUNIROUTER: INVALID_PATH'
    );

    const amounts = await router.getAmountsOut(swapAmount, poolsPath, path);
    await expectRevert(
      router.swapExactBNBForTokensSupportingFeeOnTransferTokens(
        amounts[amounts.length - 1],
        poolsPath,
        path,
        trader,
        MaxUint256,
        {
          from: trader,
          value: swapAmount
        }
      ),
      'BUNIROUTER: INSUFFICIENT_OUTPUT_AMOUNT'
    );
    await router.swapExactBNBForTokensSupportingFeeOnTransferTokens(0, poolsPath, path, trader, MaxUint256, {
      from: trader,
      value: swapAmount
    });
  });

  // DTT -> BNB
  it('swapExactTokensForBNBSupportingFeeOnTransferTokens', async () => {
    const feeTokenAmount = expandTo18Decimals(5)
      .mul(new BN(100))
      .div(new BN(99));
    const path = [feeToken.address, wbnb.address];
    const poolsPath = [pool.address];
    const bnbAmount = expandTo18Decimals(10);
    const swapAmount = expandTo18Decimals(1);
    await addLiquidity(feeTokenAmount, bnbAmount, liquidityProvider);

    await feeToken.transfer(trader, swapAmount.mul(new BN(2)));
    await feeToken.approve(router.address, MaxUint256, {from: trader});
    await expectRevert(
      router.swapExactTokensForBNBSupportingFeeOnTransferTokens(
        swapAmount,
        0,
        poolsPath,
        [feeToken.address, normalToken.address],
        trader,
        MaxUint256,
        {
          from: trader
        }
      ),
      'BUNIROUTER: INVALID_PATH'
    );
    const amounts = await router.getAmountsOut(swapAmount, poolsPath, path);
    await expectRevert(
      router.swapExactTokensForBNBSupportingFeeOnTransferTokens(
        swapAmount,
        amounts[amounts.length - 1],
        poolsPath,
        path,
        trader,
        MaxUint256,
        {
          from: trader
        }
      ),
      'BUNIROUTER: INSUFFICIENT_OUTPUT_AMOUNT'
    );
    await router.swapExactTokensForBNBSupportingFeeOnTransferTokens(
      swapAmount,
      0,
      poolsPath,
      path,
      trader,
      MaxUint256,
      {
        from: trader
      }
    );
  });

  it('swapExactTokensForTokensSupportingFeeOnTransferTokens', async () => {
    const feeToken2 = await FeeToken.new('feeOnTransfer Token2', 'FOT2', expandTo18Decimals(100000));

    /// create pool
    await factory.createPool(feeToken.address, feeToken2.address, new BN(10000));
    const poolAddresses = await factory.getPools(feeToken.address, feeToken2.address);
    tokenPool = await BuniCornPool.at(poolAddresses[0]);

    const feeTokenAmount = expandTo18Decimals(5)
      .mul(new BN(100))
      .div(new BN(99));
    const feeTokenAmount2 = expandTo18Decimals(5);
    const amountIn = expandTo18Decimals(1);

    await feeToken.approve(router.address, MaxUint256);
    await feeToken2.approve(router.address, MaxUint256);
    await router.addLiquidity(
      feeToken.address,
      feeToken2.address,
      tokenPool.address,
      feeTokenAmount,
      feeTokenAmount2,
      feeTokenAmount,
      feeTokenAmount2,
      liquidityProvider,
      MaxUint256
    );

    await feeToken.approve(router.address, MaxUint256, {from: trader});
    await feeToken.transfer(trader, amountIn.mul(new BN(2)));

    const amounts = await router.getAmountsOut(amountIn, [tokenPool.address], [feeToken.address, feeToken2.address]);
    await expectRevert(
      router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
        amountIn,
        amounts[amounts.length - 1],
        [tokenPool.address],
        [feeToken.address, feeToken2.address],
        trader,
        MaxUint256,
        {from: trader}
      ),
      'BUNIROUTER: INSUFFICIENT_OUTPUT_AMOUNT'
    );

    await router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
      amountIn,
      0,
      [tokenPool.address],
      [feeToken.address, feeToken2.address],
      trader,
      MaxUint256,
      {from: trader}
    );
  });

  it('removeLiquidityBNBWithPermitSupportingFeeOnTransferTokens', async () => {
    let feeTokenAmount = expandTo18Decimals(1);
    let bnbAmount = expandTo18Decimals(4);
    await addLiquidity(feeTokenAmount, bnbAmount, liquidityProvider);

    const liquidity = await pool.balanceOf(liquidityProvider);

    const nonce = await pool.nonces(liquidityProvider);
    const digest = await Helper.getApprovalDigest(
      pool,
      liquidityProvider,
      router.address,
      liquidity,
      nonce,
      MaxUint256
    );
    const {v, r, s} = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(liquidityProviderPkKey.slice(2), 'hex'));

    feeTokenAmount = await feeToken.balanceOf(pool.address);
    const totalSupply = await pool.totalSupply();
    const feeTokenExpected = feeTokenAmount.mul(liquidity).div(totalSupply);
    const bnbExpected = bnbAmount.mul(liquidity).div(totalSupply);

    await pool.approve(router.address, MaxUint256, {from: liquidityProvider});
    await router.removeLiquidityBNBWithPermitSupportingFeeOnTransferTokens(
      feeToken.address,
      pool.address,
      liquidity,
      feeTokenExpected,
      bnbExpected,
      liquidityProvider,
      MaxUint256,
      false,
      v,
      r,
      s,
      {from: liquidityProvider}
    );
  });
});
