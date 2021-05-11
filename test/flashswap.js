const BN = web3.utils.BN;
const Helper = require('./helper');
const {expandTo18Decimals, MaxUint256} = require('./helper');

const BuniCornRouter = artifacts.require('BuniCornRouter02');
const BuniCornPool = artifacts.require('BuniCornPool');
const BuniCornFactory = artifacts.require('BuniCornFactory');
const WBNB = artifacts.require('WBNB9');
const TestToken = artifacts.require('TestToken');
const ExampleFlashSwap = artifacts.require('ExampleFlashSwap');
const UniswapV2Factory = Helper.getTruffleContract('./node_modules/@uniswap/v2-core/build/UniswapV2Factory.json');
const UniswapV2Router = Helper.getTruffleContract('./node_modules/@uniswap/v2-periphery/build/UniswapV2Router02.json');

let wbnb;
let liquidityProvider;
let trader;
let flashSwap;
let buniFactory;
let buniRouter;
let bnbBuniPool;

let uniswapFactory;
let uniswapRouter;

contract('ExampleFlashSwap', accounts => {
  beforeEach('setup', async () => {
    liquidityProvider = accounts[0];
    trader = accounts[0];
    buniFactory = await BuniCornFactory.new(accounts[0]);
    bnbPartner = await TestToken.new('WBNB Partner', 'WBNB-P', Helper.expandTo18Decimals(10000));
    wbnb = await WBNB.new();
    buniRouter = await BuniCornRouter.new(buniFactory.address, wbnb.address);

    uniswapFactory = await UniswapV2Factory.new(accounts[0]);
    uniswapRouter = await UniswapV2Router.new(uniswapFactory.address, wbnb.address);

    flashSwap = await ExampleFlashSwap.new(uniswapRouter.address, buniFactory.address);

    // await bnbPartner.transfer(trader, initTokenAmount);
    await buniFactory.createPool(wbnb.address, bnbPartner.address, new BN(10000));
    const bnbPoolAddress = await buniFactory.getPools(wbnb.address, bnbPartner.address);
    bnbBuniPool = await BuniCornPool.at(bnbPoolAddress[0]);
  });

  it('uniswapV2Call:0', async () => {
    // add liquidity to uniswap at a rate of 1 BNB / 200 X
    const bnbUniswapPartnerAmount = expandTo18Decimals(2000);
    const bnbUniswapAmount = expandTo18Decimals(10);
    await bnbPartner.approve(uniswapRouter.address, bnbUniswapPartnerAmount);
    await uniswapRouter.addLiquidityBNB(
      bnbPartner.address,
      bnbUniswapPartnerAmount,
      0,
      0,
      liquidityProvider,
      MaxUint256,
      {
        value: bnbUniswapAmount,
        from: accounts[0]
      }
    );

    // add liquidity to buniSwap at a rate of 1 BNB / 100 X
    const bnbPartnerBuniAmount = expandTo18Decimals(1000);
    const bnbBuniAmount = expandTo18Decimals(10);
    await bnbPartner.transfer(bnbBuniPool.address, bnbPartnerBuniAmount);
    await wbnb.deposit({value: bnbBuniAmount});
    await wbnb.transfer(bnbBuniPool.address, bnbBuniAmount);
    await bnbBuniPool.mint(liquidityProvider);

    const balanceBefore = await Helper.getBalancePromise(trader);

    // now, execute arbitrage via buniSwapCall:
    // receive 1 BNB from buniSwap, get as minimum X from uniswap, repay buniSwap with minimum X, keep the rest!
    const arbitrageAmount = expandTo18Decimals(1);
    // instead of being 'hard-coded', the above value could be calculated optimally off-chain. this would be
    // better, but it'd be better yet to calculate the amount at runtime, on-chain. unfortunately, this requires a
    // swap-to-price calculation, which is a little tricky, and out of scope for the moment
    const bnbPoolToken0 = await bnbBuniPool.token0();
    const amount0 = bnbPoolToken0 === bnbPartner.address ? new BN(0) : arbitrageAmount;
    const amount1 = bnbPoolToken0 === bnbPartner.address ? arbitrageAmount : new BN(0);
    await bnbBuniPool.swap(amount0, amount1, flashSwap.address, web3.eth.abi.encodeParameters(['uint'], [new BN(1)]), {
      from: trader,
      gasPrice: new BN(0)
    });

    const balanceAfter = await Helper.getBalancePromise(trader);
    Helper.assertGreater(balanceAfter, balanceBefore);
    console.log(`profit = ${balanceAfter.sub(balanceBefore).toString()}`);
  });

  it('uniswapV2Call:1', async () => {
    // add liquidity to uniswap at a rate of 1 BNB / 100 X
    const bnbUniswapPartnerAmount = expandTo18Decimals(1000);
    const bnbUniswapAmount = expandTo18Decimals(10);
    await bnbPartner.approve(uniswapRouter.address, bnbUniswapPartnerAmount);
    await uniswapRouter.addLiquidityBNB(
      bnbPartner.address,
      bnbUniswapPartnerAmount,
      0,
      0,
      liquidityProvider,
      MaxUint256,
      {
        value: bnbUniswapAmount,
        from: accounts[0]
      }
    );

    // add liquidity to buniSwap at a rate of 1 BNB / 200 X
    const bnbPartnerBuniAmount = expandTo18Decimals(2000);
    const bnbBuniAmount = expandTo18Decimals(10);
    await bnbPartner.transfer(bnbBuniPool.address, bnbPartnerBuniAmount);
    await wbnb.deposit({value: bnbBuniAmount});
    await wbnb.transfer(bnbBuniPool.address, bnbBuniAmount);
    await bnbBuniPool.mint(liquidityProvider);

    const balanceBefore = await Helper.getBalancePromise(trader);

    // now, execute arbitrage via buniSwapCall:
    // receive 200 X from buniSwap, get as much BNB from uniswap as we can, repay buniSwap with minimum BNB, keep the rest!
    const arbitrageAmount = expandTo18Decimals(200);
    // instead of being 'hard-coded', the above value could be calculated optimally off-chain. this would be
    // better, but it'd be better yet to calculate the amount at runtime, on-chain. unfortunately, this requires a
    // swap-to-price calculation, which is a little tricky, and out of scope for the moment
    const bnbPoolToken0 = await bnbBuniPool.token0();
    const amount0 = bnbPoolToken0 === bnbPartner.address ? arbitrageAmount : new BN(0);
    const amount1 = bnbPoolToken0 === bnbPartner.address ? new BN(0) : arbitrageAmount;
    await bnbBuniPool.swap(amount0, amount1, flashSwap.address, web3.eth.abi.encodeParameters(['uint'], [new BN(1)]), {
      from: trader,
      gasPrice: new BN(0)
    });

    const balanceAfter = await Helper.getBalancePromise(trader);
    Helper.assertGreater(balanceAfter, balanceBefore);
    console.log(`profit = ${balanceAfter.sub(balanceBefore).toString()}`);
  });
});
