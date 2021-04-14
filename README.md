# BuniCorn Dynamic Automated Market Maker
## Introduction
This repository contains the bunicorn smart contracts.

## Package Manager
We use `yarn` as the package manager. You may use `npm` and `npx` instead, but commands in bash scripts may have to be changed accordingly.

## Requirements
- The following assumes the use of `node@>=10`.

- For interactions or contract deployments on public testnets / mainnet, create a `.env` file specifying your private key and infura api key, with the following format:

```
PRIVATE_KEY=0x****************************************************************
INFURA_API_KEY=********************************
ETHERSCAN_API_KEY=********************************
```

# Setup
For interactions or contract deployments on public testnets / mainnet, create a .env file specifying your private key and infura api key, with the following format:
```
INFURA_API_KEY = 'xxxxx'
ETHERSCAN_API_KEY = 'xxxxx'
PRIVATE_KEY = 'xxxxx'
```

## Install Dependencies

`yarn`

## Compile Contracts

`yarn compile`

## Run Tests

`yarn test`

## Run coverage

`./coverage.sh`