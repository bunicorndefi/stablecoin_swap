const BuniCornFactory = artifacts.require('BuniCornFactory');
const BuniCornRouter02 = artifacts.require('BuniCornRouter02');

async function main () {
  const chainId = await web3.eth.getChainId();
  const metadata = require(`./metadata/${chainId}.json`);

  const accounts = await web3.eth.getAccounts();
  // We get the contract to deploy
  const factory = await BuniCornFactory.new(accounts[0]);
  console.log('Factory deployed to:', factory.address);

  const router = await BuniCornRouter02.new(factory.address);
  console.log('Router deployed to:', router.address);

  await factory.setRouter(router.address);
  console.log('Deploy completed!');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

// kovan
// Factory 0x82eF42Fe3657643CD6bc742d902D28753d16460E
// RouterV2 0xB21b3743B733158c93C11D6A29BDcBF7817c86AE

// bsc
// Factory
// RouterV2