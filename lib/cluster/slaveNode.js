var
  util = require('util'),
  Node = require('./node'),
  _context,
  _manager;

function SlaveNode (manager, context, options) {
  _context = context;
  _manager = manager;
  this.kuzzle = _context.kuzzle;
  this.options = options;

  this.uuid = context.uuid;
}

SlaveNode.prototype.init = function () {
  this.broker = new _context.constructors.services.broker.WsBrokerClient(
    'cluster',
    this.options,
    this.kuzzle.pluginsManager,
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
        this.kuzzle.hotelClerck.rooms = response.data.hc.rooms;
        this.kuzzle.hotelClerck.customers = response.data.customers;
        this.kuzzle.dsl.filterTree = response.data.filterTree;
        this.kuzzle.indexCache = response.data.indexCache;
        break;
    }
  });

  // we inform the master we are in
  this.broker.send('cluster:join', {
    uuid: this.uuid,
    options: this.options
  });

  // common events
  this.addDiffListener();

}
