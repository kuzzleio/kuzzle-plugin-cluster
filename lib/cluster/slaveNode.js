var
  util = require('util'),
  Node = require('./node'),
  _context,
  _manager,
  _kuzzle;

function SlaveNode (manager, context, options) {
  _context = context;
  _manager = manager;
  _kuzzle = context.kuzzle;
  this.options = options;

  this.uuid = context.uuid;
}

SlaveNode.prototype.init = function () {
  this.broker = new _context.constructors.services.broker.WsBrokerClient(
    'cluster',
    this.options,
    this.context.kuzzle.pluginsManager,
    true
  );

  return this.broker.init()
    .then(() => attachEvents.call(this));
};

util.inherits(SlaveNode, Node);

module.exports = SlaveNode;


function attachEvents () {
  // we setup a private communication channel
  this.broker.listen(`cluster:${this.uuid}`, response => {
    switch (response.action) {
      case 'snapshot':
        _kuzzle.hotelClerck.rooms = response.data.hc.rooms;
        _kuzzle.hotelClerck.customers = response.data.customers;
        _kuzzle.dsl.filterTree = response.data.filterTree;
        _kuzzle.indexCache = response.data.indexCache;
        break;
    }
  });

  // we inform the master we are in
  this.broker.send('cluster:join', {
    uuid: this.uuid,
    options: this.options
  });

}
