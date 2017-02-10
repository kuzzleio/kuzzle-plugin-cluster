var
  Promise = require('bluebird'),
  util = require('util'),
  Node = require('./node');

/**
 *
 * @param context
 * @param options
 * @constructor
 */
function MasterNode () {
  Node.apply(this, arguments);

  this.slaves = {};
}

util.inherits(MasterNode, Node);

MasterNode.prototype.init = function () {
  this.broker = this.kuzzle.services.list.broker;
  this.lbBroker = this.kuzzle.services.list.proxyBroker;

  this.isReady = true;
  attachEvents.call(this);
  this.clusterStatus = {
    nodesCount: 1,
    slaves: {},
    master: {
      uuid: this.clusterHandler.uuid,
      options: {
        host: this.clusterHandler.config.binding.host,
        port: this.clusterHandler.config.binding.port,
        retryInterval: this.clusterHandler.config.retryInterval
      }
    }
  };
  return Promise.resolve();
};

module.exports = MasterNode;

function attachEvents () {
  // common listeners
  this.addDiffListener();

  // when a slave connects, send it the current full state snapshot
  this.broker.listen('cluster:join', msg => {
    var filters = [];

    Object.keys(this.kuzzle.dsl.storage.filters).forEach(fid => {
      var f = this.kuzzle.dsl.storage.filters[fid];
      filters.push({
        idx: f.index,
        coll: f.collection,
        f: f.filters
      });
    });

    this.slaves[msg.uuid] = msg;

    this.broker.send(`cluster:${msg.uuid}`, {
      action: 'snapshot',
      data: {
        hc: {
          r: this.kuzzle.hotelClerk.rooms,
          c: this.kuzzle.hotelClerk.customers
        },
        fs: filters,
        ic: this.kuzzle.indexCache.indexes
      }
    });

    this.clusterStatus.nodesCount = Object.keys(this.slaves).length + 1;
    this.clusterStatus.slaves = this.slaves;

    this.broker.broadcast('cluster:update', {cs: this.clusterStatus});
  });

  this.broker.onErrorHandlers.push(() => {
    this.isReady = false;
  });

  this.broker.onCloseHandlers.push(roomId => {
    var id = roomId.replace(/^cluster:/, '');

    delete this.clusterStatus.slaves[id];
    this.clusterStatus.nodesCount = Object.keys(this.slaves).length + 1;

    this.broker.broadcast('cluster:update', {cs: this.clusterStatus});
  });

}
