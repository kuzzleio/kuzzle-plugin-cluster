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
  return Promise.resolve();
};

module.exports = MasterNode;

function attachEvents () {
  // common listeners
  this.addDiffListener();
  
  // when a slave connects, send it the current full state snapshot
  this.broker.listen('cluster:join', msg => {
    this.slaves[msg.uuid] = msg;

    this.broker.send(`cluster:${msg.uuid}`, {
      action: 'snapshot',
      data: {
        hc: {
          rooms: this.kuzzle.hotelClerk.rooms,
          customers: this.kuzzle.hotelClerk.customers
        },
        ft: {
          t: this.kuzzle.dsl.filters.filtersTree,
          f: this.kuzzle.dsl.filters.filters
        },
        ic: this.kuzzle.indexCache.indexes,
      }
    });


    this.clusterStatus = {
      nodesCount: Object.keys(this.slaves).length + 1,
      slaves: this.slaves,
      master: {
        uuid: this.clusterHandler.uuid,
        options: {
          host: this.clusterHandler.config.binding.host,
          port: this.clusterHandler.config.binding.port,
          retryInterval: this.clusterHandler.config.retryInterval
        }
      }
    };

    this.broker.broadcast('cluster:update', {cs: this.clusterStatus});
  });
  
  this.broker.onErrorHandlers.push(() => {
    this.isReady = false;
  });

}
