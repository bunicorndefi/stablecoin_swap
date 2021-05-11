const {artifacts} = require('hardhat');
const BN = web3.utils.BN;
const Helper = require('./helper');

const BuniCornFactory = artifacts.require('BuniCornFactory');
const BuniCornRouter02 = artifacts.require('BuniCornRouter02');
const BuniCornPool = artifacts.require('BuniCornPool');
const FeeTo = artifacts.require('FeeTo');
const MockBuniCornDao = artifacts.require('MockBuniCornDao');
const WBNB = artifacts.require('WBNB9');
const TestToken = artifacts.require('TestToken');

let feeToSetter;
let daoOperator;

let wbnb;
let token;

contract('FeeTo', accounts => {
  before('setup', async () => {
    feeToSetter = accounts[1];
    daoOperator = accounts[2];

    wbnb = await WBNB.new();
    token = await TestToken.new('test', 't1', Helper.expandTo18Decimals(100000));
  });

  it('demo feeTo', async () => {
    let factory = await BuniCornFactory.new(feeToSetter);
    await factory.createPool(wbnb.address, token.address, new BN(10000));
    const poolAddress = await factory.getUnamplifiedPool(wbnb.address, token.address);
    const pool = await BuniCornPool.at(poolAddress);

    /// setup dao and feeTo
    let epoch = new BN(1);
    const dao = await MockBuniCornDao.new(new BN(0), new BN(0), epoch, new BN(0));
    const feeTo = await FeeTo.new(dao.address, daoOperator);
    await factory.setFeeConfiguration(feeTo.address, new BN(1000), {from: feeToSetter});
    await feeTo.setAllowedToken(pool.address, true, {from: daoOperator});

    /// setup router
    let router = await BuniCornRouter02.new(factory.address, wbnb.address);

    await token.approve(router.address, Helper.MaxUint256);
    await router.addLiquidityBNB(
      token.address,
      poolAddress,
      Helper.expandTo18Decimals(100),
      new BN(0),
      new BN(0),
      accounts[0],
      Helper.MaxUint256,
      {value: Helper.expandTo18Decimals(10)}
    );

    let txResult = await router.swapExactBNBForTokens(
      new BN(0),
      [poolAddress],
      [wbnb.address, token.address],
      accounts[0],
      Helper.MaxUint256,
      {
        value: Helper.expandTo18Decimals(1)
      }
    );
    console.log(`gas used when swap with _mintFee: ${txResult.receipt.gasUsed}`);
    /// test gascost with non-zero storage cost
    await dao.advanceEpoch();
    await feeTo.finalize(pool.address, new BN(1));
    txResult = await router.swapExactBNBForTokens(
      new BN(0),
      [poolAddress],
      [wbnb.address, token.address],
      accounts[0],
      Helper.MaxUint256,
      {
        value: Helper.expandTo18Decimals(1)
      }
    );
    console.log(`gas used when swap with _mintFee: ${txResult.receipt.gasUsed}`);

    console.log(await feeTo.rewardsPerEpoch(new BN(1), pool.address));
  });
});
