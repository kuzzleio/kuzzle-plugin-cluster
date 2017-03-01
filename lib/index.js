var
  _ = require('lodash'),
  os = require('os'),
  hooks = require('./config/hooks'),
  routes = require('./config/routes'),
  controllers = require('./config/controllers'),
  InternalError = require('kuzzle-common-objects').errors.InternalError,
  MasterNode = require('./cluster/masterNode'),
  SlaveNode = require('./cluster/slaveNode'),
  Bluebird = require('bluebird'),
  _context;

function KuzzleCluster () {}

KuzzleCluster.prototype.init = function (customConfig, context) {
  let defaultConfig = {
    'binding': '[eth0:ipv4]:7911',
    'retryInterval': 2000
  };
  this.config = Object.assign(defaultConfig, customConfig);
  _context = context;

  if (!_context.accessors.kuzzle) {
    return console.error('kuzzle-plugin-cluster: plugin context is not privileged.' + // eslint-disable-line no-console
      'Please set the privileged param to true in Kuzzle config for this plugin.');
  }

  this.kuzzle = _context.accessors.kuzzle;

  // Plugins configuration is currently stored globally for all nodes.
  // We need a per node config and at the moment, using rc capabilities is the easy way to go.
  // @todo: clean up if needed once Kuzzle configuration storage has evolved.
  if (context.accessors.kuzzle.config.cluster) {
    this.config = _.merge(this.config, context.accessors.kuzzle.config.cluster);
  }

  this.config.binding = resolveBinding(this.config.binding);
  this.uuid = this.config.binding.host + ':' + this.config.binding.port;

  this.node = null;

  // used only for core-dump analysis
  this.isMasterNode = false;

  this.hooks = hooks;
  this.routes = routes;
  this.controllers = controllers;

  return this;
};

KuzzleCluster.prototype.getClusterStatus = function (request) {
  return Bluebird.resolve({status: this.node.clusterStatus});
};

KuzzleCluster.prototype.kuzzleStarted = function () {
  this.kuzzle.pluginsManager.trigger('log:info', '[cluster] "Kuzzle is started" event received');

  this.lbBroker = this.kuzzle.services.list.proxyBroker;
  this.lbBroker.listen('cluster:' + this.uuid, onLbMessage.bind(this));
  this.lbBroker.listen('cluster:master', onLbMessage.bind(this));

  this.lbBroker.send('cluster:join', {
    uuid: this.uuid,
    host: this.config.binding.host,
    port: this.config.binding.port,
    action: 'joined'
  });
};

KuzzleCluster.prototype.indexCacheAdded = function (diff) {
  if (!this.node || !this.node.isReady) {
    return;
  }

  this.node.broker.broadcast('cluster:update', {
    icAdd: {i: diff.index, c: diff.collection}
  });
};

KuzzleCluster.prototype.indexCacheRemoved = function (diff) {
  if (!this.node || !this.node.isReady) {
    return;
  }

  this.node.broker.broadcast('cluster:update', {
    icDel: {i: diff.index, c: diff.collection}
  });
};

KuzzleCluster.prototype.indexCacheResett = function (diff) {
  if (!this.node || !this.node.isReady) {
    return;
  }

  this.node.broker.broadcast('cluster:update', {icReset: {i: diff.index}});
};

/**
 *
 * @param {Object} diff
 */
KuzzleCluster.prototype.subscriptionAdded = function (diff) {
  if (!this.node || !this.node.isReady) {
    return;
  }

  this.node.broker.broadcast('cluster:update', diff);
};

/**
 *
 * @param {Object} diff
 */
KuzzleCluster.prototype.subscriptionJoined = function (diff) {
  if (!this.node || !this.node.isReady) {
    return;
  }

  this.node.broker.broadcast('cluster:update', diff);
};

/**
 *
 * @param {{requestContext: RequestContext, roomId: string}} object
 */
KuzzleCluster.prototype.subscriptionOff = function (object) {
  if (!this.node || !this.node.isReady) {
    return;
  }

  this.node.broker.broadcast('cluster:update', { hcDel: { c: {i: object.requestContext.connectionId, p: object.requestContext.protocol}, r: object.roomId } });
};

/**
 *
 */
KuzzleCluster.prototype.refreshSpecifications = function () {
  if (!this.node || !this.node.isReady) {
    return;
  }

  this.node.broker.broadcast('cluster:update', { vu: {} });
};


/**
 *
 * @param {Request} request
 */
KuzzleCluster.prototype.autoRefreshUpdated = function (request) {
  console.log('DEBUG: "autoRefreshUpdated" 1/2', request.input.resource.index, request.input.body.autoRefresh, typeof request.input.body.autoRefresh, this.node)
  if (!this.node || !this.node.isReady) {
    return;
  }

  if (request.input.body.autoRefresh === undefined) {
    return;
  }
  if (typeof request.input.body.autoRefresh !== 'boolean') {
    return;
  }

  console.log('DEBUG: "cluster:update', {ar: {i: request.input.resource.index, v: request.input.body.autoRefresh}})
  this.node.broker.broadcast('cluster:update', {ar: {i: request.input.resource.index, v: request.input.body.autoRefresh}});
};

KuzzleCluster.prototype.refreshSpecifications = function () {
  if (!this.node || !this.node.isReady) {
    return;
  }

  this.node.broker.broadcast('cluster:update', { vu: {} });
};

module.exports = KuzzleCluster;

function resolveBinding (config) {
  var
    host = config,
    port = _context.accessors.kuzzle.config.services.internalBroker.port,
    match,
    iface,
    family,
    tmp;

  // anything:#### case test
  match = /^(.*?)(?::(\d+))?$/.exec(config);

  if (match) {
    if (match[2]) {
      port = parseInt(match[2]);
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


  return {
    host,
    port
  };
}

/**
 * @this KuzzleCluster
 * @param msg
 */
function onLbMessage (msg) {
  this.kuzzle.pluginsManager.trigger('log:debug', `[cluster] onLbMessage: ${JSON.stringify(msg)}`);

  console.log('onLbMessage', msg)

  switch (msg.action) {
    case 'joined':
      return onJoinedLb.call(this, msg);
    case 'ack':
      this.kuzzle.pluginsManager.trigger('log:info', `[cluster] ACK for ${msg.on} event received from LB`);
      break;
  }
}

/**
 * @this KuzzleCluster
 * @param msg
 * @returns {Promise<any>|Promise.<T>}
 */
function onJoinedLb (msg) {
  if (this.node) {
    this.node.destroy();
  }

  console.log('onJoinedLb', msg)

  if (msg.uuid === this.uuid) {
    console.log('onJoinedLb => master')
    this.isMasterNode = true;
    this.node = new MasterNode(this, _context, {});
  }
  else {
    console.log('onJoinedLb => slave')
    this.isMasterNode = false;
    this.node = new SlaveNode(this, _context, {
      host: msg.host,
      port: msg.port,
      retryInterval: this.config.retryInterval
    });
  }

  return this.node.init()
    .then(() => {
      this.kuzzle.pluginsManager.trigger('log:info', '[cluster] Notification: Kuzzle is ready');
      this.kuzzle.pluginsManager.trigger('log:info', `[cluster] ${this.uuid} joined as ${this.node.constructor.name} on ${msg.host}:${msg.port}`);
      this.lbBroker.send('cluster:status', {status: 'ready'});
    })
    .catch(err => {
      this.kuzzle.pluginsManager.trigger('log:error', `[cluster] ${this.uuid} Could not join cluster.\n${err.stack}`);
      this.lbBroker.send('cluster:status', {
        status: 'error',
        code: 2,
        msg: 'Error while initting the cluster node',
        originalError: err
      });
    });

}
