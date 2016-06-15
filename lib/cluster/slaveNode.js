var
  md5 = require('crypto-md5'),
  os = require('os'),
  util = require('util'),
  InternalError = require('kuzzle-common-objects').Errors.internalError,
  Node = require('./node'),
  _context;

function SlaveNode (context, options) {
  _context = context;
  this.kuzzle = _context.kuzzle;
  this.options = options;

  this.options.binding = resolveBinding(options.binding);

  this.uuid = md5(this.options.binding);
}

util.inherits(SlaveNode, Node);

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


module.exports = SlaveNode;


function attachEvents () {
  // we setup a private communication channel
  this.broker.listen(`cluster:${this.uuid}`, response => {
    switch (response.action) {
      case 'snapshot':
        this.kuzzle.hotelClerk.rooms = response.data.hc.rooms;
        this.kuzzle.hotelClerk.customers = response.data.hc.customers;
        this.kuzzle.dsl.filters.filtersTree = response.data.ft.t;
        this.kuzzle.dsl.filters.filters = response.data.ft.f;
        this.kuzzle.indexCache = response.data.ic;
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

function resolveBinding (config) {
  var
    host = config,
    port = _context.kuzzle.config.internalBroker.port,
    match,
    iface,
    family,
    tmp;

  // anything:#### case test
  match = /^(.*?)(?::(\d+))?$/.exec(config);

  if (match) {
    if (match[2]) {
      port = match[2];
    }
    host = match[1];

    // [eth0:ipv4] case test
    match = /^\[(.*?):(.*?)\]/.exec(host);

    if (match) {
      iface = match[1];
      family = match[2].toLowerCase();

      if (os.networkInterfaces()[iface]) {
        tmp = os.networkInterfaces()[iface].filter(def => family === def.family.toLowerCase());

        if (tmp.length) {
          host = tmp[0].address;
        }
        else {
          throw new InternalError(`Invalid ip family provided [${family}] for network interface ${iface}`);
        }
      }
      else {
        throw new InternalError(`Invalid network interface provided [${iface}]`);
      }
    }
  }

  return host + ':' + port;
}
