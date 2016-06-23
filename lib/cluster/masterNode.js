var
  q = require('q'),
  util = require('util'),
  Node = require('./node');

function MasterNode (context, options) {
  this.options = options;
  this.kuzzle = context.accessors.kuzzle;

  this.uuid = context.uuid;

  this.slaves = {};
  
  this.isReady = false;
}

util.inherits(MasterNode, Node);

MasterNode.prototype.init = function () {
  this.broker = this.kuzzle.services.list.broker;

  this.isReady = true;
  attachEvents.call(this);
  return q();
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
          rooms: this.kuzzle.hotelClerk.rooms,
          customers: this.kuzzle.hotelClerk.customers
        },
        ft: {
          t: this.kuzzle.dsl.filters.filtersTree,
          f: this.kuzzle.dsl.filters.filters
        },
        ic: this.kuzzle.indexCache.indexes
      }
    });
  });
  
  this.broker.onErrorHandlers.push(() => {
    this.isReady = false;
  });

}
