const
  Bluebird = require('bluebird'),
  sinon = require('sinon');

class RedisMock {
  constructor (config) {
    this.config = config;

    this.clusterState = sinon.stub().returns(Bluebird.resolve());
    this.clusterSubOn = sinon.stub().returns(Bluebird.resolve());
    this.clusterSubOff = sinon.stub().returns(Bluebird.resolve());
    this.defineCommand = sinon.spy();
    this.del = sinon.stub().returns(Bluebird.resolve());
    this.hgetall = sinon.stub().returns(Bluebird.resolve({}));
    this.hset = sinon.stub().returns(Bluebird.resolve());
    this.sadd = sinon.stub().returns(Bluebird.resolve());
    this.scan = sinon.stub().returns(Bluebird.resolve());
    this.smembers = sinon.stub().returns(Bluebird.resolve());
    this.srem = sinon.stub().returns(Bluebird.resolve());
  }
}

RedisMock.Cluster = sinon.spy();

module.exports = RedisMock;
