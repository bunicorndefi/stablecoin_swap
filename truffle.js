module.exports = {
  solc: {
    optimizer: {
      enabled: true,
      runs: 999999
    }
  },
  networks: {
    development: {
      host: 'localhost',
      port: 8545,
      gas: 6000000,
      gasPrice: 40000000000,
      network_id: '*' // Match any network id
    },
    tbsc: {
      host: 'https://data-seed-prebsc-1-s1.binance.org',
      port: 8545,
      gas: 8000000,
      gasPrice: 40000000000,
      network_id: 97,
    },
    bsc: {
      host: 'https://bsc-dataseed1.binance.org',
      port: '443',
      gas: 8000000,
      gasPrice: 40000000000,
      network_id: 56,
    }
  },
  mocha: {
    enableTimeouts: false
  }
};
