const
  Bluebird = require('bluebird'),
  sinon = require('sinon');

class RedisMock {
  constructor (config) {
    this.config = config;

    this.clusterReset = sinon.stub().returns(Bluebird.resolve());
    this.clusterState = sinon.stub().returns(Bluebird.resolve());
    this.clusterSubOn = sinon.stub().returns(Bluebird.resolve());
    this.clusterSubOff = sinon.stub().returns(Bluebird.resolve());
    this.defineCommand = sinon.spy();
    this.hset = sinon.stub().returns(Bluebird.resolve());
    this.sadd = sinon.stub().returns(Bluebird.resolve());
  }
}

module.exports = RedisMock;
