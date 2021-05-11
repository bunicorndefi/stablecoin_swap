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
    new BigNumber(80 * 10000).toFixed(),
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
// USDT-USDC 0x3085EFE20EAEbf4745BC2cE518Ab6593797c8158
// USDT-DAI 0x9E19F094C2B91ec0276617739A068C63E292C92b
// USDT-BUSD 0x076e658f823937f6f582620eA3851b57642d6d7c
// USDC-DAI 0x6a9ab4Cd2aA6B8E3Ab44a219955509C9fEa8Eeab
// USDC-BUSD 0xC5B697492248418CEC37795834ADb8EB2B707060
// DAI-BUSD 0x587d5F30f9A3Ec036201a2c13d83C05932A050E9

// bsc