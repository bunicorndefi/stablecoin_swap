const BigNumber = require("bignumber.js");

const BuniCornRouter02 = artifacts.require('BuniCornRouter02');

async function main () {
  const token0Sym = 'DAI';
  const token1Sym = 'BUSD';

  const chainId = await web3.eth.getChainId();
  const metadata = require(`./metadata/${chainId}.json`);
  const tokens = metadata.tokens;

  const token0 = tokens[token0Sym];
  const token1 = tokens[token1Sym];

  const accounts = await web3.eth.getAccounts();
  const deadline = parseInt(new Date().getTime() / 1000, 10) * 20 * 60;

  const router = await BuniCornRouter02.at(metadata.routerV2Address);
  console.log(`Deploying ${token0.id} (${token0Sym}) - ${token1.id} (${token1Sym})...`)
  await router.addLiquidityNewPool(
    token0.id,
    token1.id,
    new BigNumber(100 * 10000).toFixed(),
    new BigNumber(10000 * 10**token0.decimals).toFixed(),
    new BigNumber(10000 * 10**token1.decimals).toFixed(),
    new BigNumber(10000 * 10**token0.decimals).toFixed(),
    new BigNumber(10000 * 10**token1.decimals).toFixed(),
    accounts[0],
    deadline
  )

  console.log(`Pool ${token0Sym}-${token1Sym} Created!`);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

// kovan
// USDT-USDC 0x5895532D9A9c69Fb27331C0a2FA99deF24Bb3B06
// USDT-DAI 0x70b4746769Bf13CCAedF7F601f346B9DCb556Ebd
// USDT-BUSD 0x6fa0c336C472077a1Fd0A059858A5CDCa4F8CB28
// USDC-DAI 0xcCFa5b333bCCee8BDcB69e7F4E5a5FE1595Ed5Bb
// USDC-BUSD 0x1ff9d78972B108066E8204eCB0d770b7f2294e72
// DAI-BUSD 0xaDB7ea2f64719D932ecAE37Ccd82c13D8E6B800f

// bsc