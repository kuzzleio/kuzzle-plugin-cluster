var
  q = require('q'),
  util = require('util'),
  Node = require('./node'),
  Slave = require('./slave'),
  _context,
  _manager,
  _kuzzle;

function MasterNode (manager, context, options) {
  _manager = manager;
  this.options = options;
  _context = context;
  _kuzzle = context.kuzzle;

  this.uuid = context.uuid;

  this.slaves = {};
}

MasterNode.prototype.init = function MasterNode () {
  this.broker = _kuzzle.services.list.internalBroker;

  attachEvents.call(this);

  return q();
};

util.inherits(MasterNode, Node);

module.exports = MasterNode;

function attachEvents () {
  // when a slave connects, send it the current full state snapshot
  this.broker.listen('cluster:join', msg => {
    this.slaves[msg.uuid] = new Slave(_context, msg.options);

    this.broker.send(`cluster:${msg.uuid}`, {
      action: 'snapshot',
      data: {
        hc: {
          rooms: _kuzzle.hotelClerck.rooms,
          customers: _kuzzle.hotelClerck.customers
        },
        ft: _kuzzle.dsl.filterTree,
        ic: _kuzzle.indexCache
      }
    });
  });

}
