var
  util = require('util'),
  Node = require('./node'),
  Slave = require('./slave'),
  _context;

function MasterNode (context, options) {
  this.options = options;
  _context = context;
  this.kuzzle = context.kuzzle;

  this.uuid = context.uuid;

  this.slaves = {};
}

util.inherits(MasterNode, Node);

MasterNode.prototype.init = function () {
  this.broker = this.kuzzle.services.list.broker;

  attachEvents.call(this);
};

module.exports = MasterNode;

function attachEvents () {
  // when a slave connects, send it the current full state snapshot
  this.broker.listen('cluster:join', msg => {
    this.slaves[msg.uuid] = new Slave(_context, msg.options);

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
        ic: this.kuzzle.indexCache
      }
    });
  });

  // common listeners
  this.addDiffListener();
}
