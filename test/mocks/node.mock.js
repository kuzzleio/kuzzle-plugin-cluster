const
  Bluebird = require('bluebird'),
  sinon = require('sinon');

class NodeMock {
  constructor (cluster) {
    this.cluster = cluster;

    this.pendingRooms = {
      create: {},
      delete: {}
    };

    this._syncState = sinon.spy();
    this.broadcast = sinon.spy();
    this.init = sinon.stub().returns(Bluebird.resolve());
    this.state = {
      getVersion: sinon.spy(),
      locks: {
        create: {
          delete: sinon.spy()
        },
        delete: {
          delete: sinon.spy()
        }
      },
      reset: sinon.stub().returns(Bluebird.resolve()),
      syncAll: sinon.stub().returns(Bluebird.resolve())
    };
  }

  get config () {
    return this.cluster.config;
  }
}

module.exports = NodeMock;
