// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.12;

import "../BuniCornPool.sol";

contract MockAuthorBuniCornPool is BuniCornPool {

  constructor(
      address _factory,
      IERC20 _token0,
      IERC20 _token1,
      uint32 _ampBps
  ) public BuniCornPool() {
      factory = IBuniCornFactory(_factory);
      token0 = _token0;
      token1 = _token1;
      ampBps = _ampBps;
  }

  function mockAuthor(address _author) external {
      author = _author;
  }
}