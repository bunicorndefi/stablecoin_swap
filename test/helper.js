const BN = web3.utils.BN;
const MINIMUM_LIQUIDITY = new BN(10).pow(new BN(3));

const precisionUnits = new BN(10).pow(new BN(18));
const zeroBN = new BN(0);
const ethAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const MaxUint256 = new BN(2).pow(new BN(256)).sub(new BN(1));
const BPS = new BN(10000);
const Q112 = new BN(2).pow(new BN(112));

require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bn')(BN))
  .should();

module.exports = {
  precisionUnits,
  assertEqual,
  assertApproximate,
  zeroBN,
  ethAddress,
  MINIMUM_LIQUIDITY,
  MaxUint256,
  BPS,
  Q112
};

function assertEqual (val1, val2, errorStr) {
  assert(new BN(val1).should.be.a.bignumber.that.equals(new BN(val2)), errorStr);
}

function assertApproximate (val1, val2, errorStr) {
  if (new BN(val1).gt(new BN(val2))) {
    assert(
      new BN(val1).sub(new BN(val2)).should.be.a.bignumber.that.lessThan(new BN(val1).div(new BN(10000))),
      errorStr
    );
  } else {
    assert(
      new BN(val2).sub(new BN(val1)).should.be.a.bignumber.that.lessThan(new BN(val2).div(new BN(10000))),
      errorStr
    );
  }
}

module.exports.getCurrentBlock = function () {
  return new Promise(function (fulfill, reject) {
    web3.eth.getBlockNumber(function (err, result) {
      if (err) reject(err);
      else fulfill(result);
    });
  });
};

module.exports.getCurrentBlockTime = function () {
  return new Promise(function (fulfill, reject) {
    web3.eth.getBlock('latest', false, function (err, result) {
      if (err) reject(err);
      else fulfill(result.timestamp);
    });
  });
};

module.exports.getCreate2Address = function (deployer, salt, bytecodeHash) {
  return web3.utils.soliditySha3('0xff' + deployer.slice(2) + salt.slice(2) + bytecodeHash.slice(2));
};

module.exports.expandTo18Decimals = function (n) {
  return new BN(n).mul(new BN(10).pow(new BN(18)));
};

module.exports.mineNewBlockAt = async function (timestamp) {
  return new Promise((resolve, reject) => {
    web3.currentProvider.send.bind(web3.currentProvider)(
      {
        jsonrpc: '2.0',
        method: 'evm_mine',
        params: [timestamp],
        id: new Date().getTime()
      },
      (err, res) => {
        if (err) {
          return reject(err);
        }
        resolve(res);
      }
    );
  });
};

module.exports.sqrt = function (y) {
  if (y.gt(new BN(3))) {
    let z = new BN(y);
    let x = y.div(new BN(2)).add(new BN(1));
    while (x.lt(z)) {
      z = new BN(x);
      x = y
        .div(x)
        .add(x)
        .div(new BN(2));
    }
    return z;
  } else if (y.eq(0)) {
    return new BN(1);
  }
  return new BN(0);
};

module.exports.getBalancePromise = function (account) {
  return new Promise(function (fulfill, reject) {
    web3.eth.getBalance(account, function (err, result) {
      if (err) reject(err);
      else fulfill(new BN(result));
    });
  });
};

module.exports.sendEtherWithPromise = function (sender, recv, amount) {
  return new Promise(function (fulfill, reject) {
    web3.eth.sendTransaction({to: recv, from: sender, value: amount}, function (error, result) {
      if (error) {
        return reject(error);
      } else {
        return fulfill(true);
      }
    });
  });
};

const PERMIT_TYPEHASH = '0x6e71edae12b1b97f4d1f60370fef10105fa2faae0126114a169c64845d6126c9';
module.exports.getApprovalDigest = getApprovalDigest;
async function getApprovalDigest (token, owner, spender, value, nonce, deadline) {
  const domainSeparator = await token.domainSeparator();

  const tmp = web3.utils.soliditySha3(
    web3.eth.abi.encodeParameters(
      ['bytes32', 'address', 'address', 'uint256', 'uint256', 'uint256'],
      [PERMIT_TYPEHASH, owner, spender, value, nonce, deadline]
    )
  );
  return web3.utils.soliditySha3(
    '0x' +
      Buffer.concat([
        Buffer.from('1901', 'hex'),
        Buffer.from(domainSeparator.slice(2), 'hex'),
        Buffer.from(tmp.slice(2), 'hex')
      ]).toString('hex')
  );
}

function readArtifactSync (artifactsPath) {
  const fsExtra = require('fs-extra');
  if (!fsExtra.pathExistsSync(artifactsPath)) {
    throw `artifact not found ${artifactsPath}`;
  }
  return fsExtra.readJsonSync(artifactsPath);
}
module.exports.getTruffleContract = getTruffleContract;
function getTruffleContract (artifactsPath) {
  const artifact = readArtifactSync(artifactsPath);
  const TruffleContractFactory = require('@nomiclabs/truffle-contract');
  const Contract = TruffleContractFactory(artifact);
  Contract.setProvider(web3.currentProvider);
  return Contract;
}

module.exports.assertGreater = function (val1, val2, errorStr) {
  assert(new BN(val1).should.be.a.bignumber.that.is.greaterThan(new BN(val2)), errorStr);
};

module.exports.assertLesser = function (val1, val2, errorStr) {
  assert(new BN(val1).should.be.a.bignumber.that.is.lessThan(new BN(val2)), errorStr);
};

module.exports.assertEqualArray = assertEqualArray;
function assertEqualArray (arr1, arr2, errorStr) {
  assert(arr1.equals(arr2), `${errorStr} actual=${arr1} expected=${arr2}`);
}

// Warn if overriding existing method
if (Array.prototype.equals)
  console.warn(
    "Overriding existing Array.prototype.equals. Possible causes: New API defines the method, there's a framework conflict or you've got double inclusions in your code."
  );

// attach the .equals method to Array's prototype to call it on any array
Array.prototype.equals = function (array) {
  // if the other array is a falsy value, return
  if (!array) return false;

  // compare lengths - can save a lot of time
  if (this.length != array.length) return false;

  for (var i = 0, l = this.length; i < l; i++) {
    // Check if we have nested arrays
    if (this[i] instanceof Array && array[i] instanceof Array) {
      // recurse into the nested arrays
      if (!this[i].equals(array[i])) return false;
    } else if (web3.utils.isBN(this[i]) && web3.utils.isBN(array[i])) {
      if (!this[i].eq(array[i])) return false;
    } else if (this[i] != array[i]) {
      // Warning - two different object instances will never be equal: {x:20} != {x:20}
      return false;
    }
  }
  return true;
};
// Hide method from for-in loops
Object.defineProperty(Array.prototype, 'equals', {enumerable: false});
