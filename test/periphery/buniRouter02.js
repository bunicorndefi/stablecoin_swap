const Helper = require('../helper');
const {MaxUint256, expandTo18Decimals, MINIMUM_LIQUIDITY} = require('../helper');
const BN = web3.utils.BN;
const {ecsign} = require('ethereumjs-util');
const expectRevert = require('@openzeppelin/test-helpers/src/expectRevert');

const BuniCornFactory = artifacts.require('BuniCornFactory');
const BuniCornPool = artifacts.require('BuniCornPool');
const FeeToken = artifacts.require('MockFeeOnTransferERC20');
const TestToken = artifacts.require('TestToken');

const BuniCornRouter02 = artifacts.require('BuniCornRouter02');

let feeToken;
let normalToken;

let factory;
let pool;
let router;
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
  });

  beforeEach(' setup factory and router', async () => {
    feeToken = await FeeToken.new('feeOnTransfer Token', 'FOT', expandTo18Decimals(100000));
    normalToken = await TestToken.new('test', 't1', expandTo18Decimals(100000));

    factory = await BuniCornFactory.new(feeSetter);
    router = await BuniCornRouter02.new(factory.address);
  });

  afterEach(async function () {
    Helper.assertEqual(await Helper.getBalancePromise(router.address), new BN(0));
  });

  it('swapExactTokensForTokensSupportingFeeOnTransferTokens', async () => {
    const feeToken2 = await FeeToken.new('feeOnTransfer Token2', 'FOT2', expandTo18Decimals(100000));

    /// create pool
    await factory.createPool(feeToken.address, feeToken2.address, new BN(10000));
    const poolAddresses = await factory.getPools(feeToken.address, feeToken2.address);
    tokenPool = await BuniCornPool.at(poolAddresses[poolAddresses.length - 1]);

    const feeTokenAmount = expandTo18Decimals(5)
      .mul(new BN(100))
      .div(new BN(99));
    const feeTokenAmount2 = expandTo18Decimals(5);
    const amountIn = expandTo18Decimals(1);

    await feeToken.transfer(tokenPool.address, feeTokenAmount);
    await feeToken2.transfer(tokenPool.address, feeTokenAmount2);
    await tokenPool.mint(liquidityProvider);
    // approve to the router and tranfer token to trader
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
});
