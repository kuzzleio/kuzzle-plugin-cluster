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
    this.broker.send(`cluster:${msg.uuid}`, {
      action: 'snapshot',
      data: {
        hc: {
          r: this.kuzzle.hotelClerk.rooms,
          c: this.kuzzle.hotelClerk.customers
        },
        fs: {
          i: this.kuzzle.dsl.storage.filtersIndex,
          f: this.kuzzle.dsl.storage.filters,
          s: this.kuzzle.dsl.storage.subfilters,
          c: this.kuzzle.dsl.storage.conditions,
          fp: this.kuzzle.dsl.storage.foPairs,
          t: this.kuzzle.dsl.storage.testTables
        },
        ic: this.kuzzle.indexCache.indexes
      }
    });
  });
  
  this.broker.onErrorHandlers.push(() => {
    this.isReady = false;
  });

}
