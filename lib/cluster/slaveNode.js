var
  util = require('util'),
  Node = require('./node');

/**
 * 
 * @param context
 * @param {host: string, port: integer, retyInterval: integer} options
 * @constructor
 */
function SlaveNode () {
  Node.apply(this, arguments);
}

util.inherits(SlaveNode, Node);

SlaveNode.prototype.init = function () {
  this.broker = new this.context.constructors.services.WsBrokerClient(
    'cluster',
    this.options,
    this.kuzzle.pluginsManager,
    true
  );

  return this.broker.init()
    .then(() => attachEvents.call(this));
};

module.exports = SlaveNode;


function attachEvents () {
  // we setup a private communication channel
  this.broker.listen(`cluster:${this.clusterHandler.uuid}`, response => {
    switch (response.action) {
      case 'snapshot':
        this.kuzzle.hotelClerk.rooms = response.data.hc.rooms;
        this.kuzzle.hotelClerk.customers = response.data.hc.customers;
        this.kuzzle.dsl.filters.filtersTree = response.data.ft.t;
        this.kuzzle.dsl.filters.filters = response.data.ft.f;
        this.kuzzle.indexCache.indexes = response.data.ic;

        this.isReady = true;
        break;
    }
  });

  // we inform the master we are in and attach the action in case of reconnection
  this.broker.onConnectHandlers.push(join.bind(this));
  join.call(this);
  
  this.broker.onCloseHandlers.push(() => {
    this.isReady = false;
  });
  
  this.broker.onErrorHandlers.push(() => {
    this.isReady = false;
  });

  // common events
  this.addDiffListener();
}

function join () {
  this.broker.send('cluster:join', {
    uuid: this.clusterHandler.uuid,
    options: this.options
  });
}
