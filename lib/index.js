'use strict';

let
  debug = require('./kuzzleDebug')('kuzzle:cluster'),
  os = require('os'),
  InternalError = require('kuzzle-common-objects').errors.InternalError,
  MasterNode = require('./cluster/masterNode'),
  SlaveNode = require('./cluster/slaveNode'),
  /** @type {PluginContext} */
  _context;

/**
 * @class KuzzleCluster
 * @property {object} config
 * @property {?Kuzzle} kuzzle
 * @property {?string} uuid
 * @property {Node} node
 * @property {?boolean} isMasterNode
 * @property {object} hooks
 * @property {object[]} routes
 * @property {object} controllers
 * @property {?ProxyBroker} lbBroker
 */
class KuzzleCluster {

  /**
   * @constructor
   */
  constructor () {
    this.config = null;
    this.kuzzle = null;
    this.uuid = null;
    this.node = null;
    this.isMasterNode = null;

    this.hooks = {
      'proxyBroker:connected': 'connectedToLB',
      'core:indexCache:add': 'indexCacheAdded',
      'core:indexCache:remove': 'indexCacheRemoved',
      'core:indexCache:reset': 'indexCacheReset',
      'core:hotelClerk:addSubscription': 'subscriptionAdded',
      'core:hotelClerk:removeRoomForCustomer': 'subscriptionOff',
      'core:hotelClerk:join': 'subscriptionJoined',
      'core:profileRepository:save': 'profileUpdated',
      'core:profileRepository:delete': 'profileUpdated',
      'core:roleRepository:save': 'roleUpdated',
      'core:roleRepository:delete': 'roleUpdated',
      'index:beforeSetAutoRefresh': 'autoRefreshUpdated',
      'collection:afterUpdateSpecifications' : 'refreshSpecifications',
      'collection:afterDeleteSpecifications' : 'refreshSpecifications'
    };

    this.routes = [
      {verb: 'get', url: '/status', controller: 'cluster', action: 'status'}
    ];

    this.controllers = {
      cluster: {
        status: 'clusterStatusAction'
      }
    };
  }

  /**
   * @param {object} config
   * @param {PluginContext} context
   * @returns {KuzzleCluster}
   */
  init (config, context) {
    _context = context;
    this.kuzzle = _context.accessors.kuzzle;

    this.node = null;

    this.config = Object.assign({
      binding: '[eth0:ipv4]:7911',
      pingTimeout: 200,
      retryInterval: 2000
    }, config || {});
    this.config.binding = resolveBinding(this.config.binding);
    this.uuid = this.config.binding.host + ':' + this.config.binding.port;

    // used only for core-dump analysis
    this.isMasterNode = false;

    debug('[%s] plugin cluster initialized with config: %a', this.uuid, this.config);

    return this;
  }

  connectedToLB () {
    let log = '[cluster] "Connected to load balancer" event received';
    let nodeInfo = {
      uuid: this.uuid,
      host: this.config.binding.host,
      port: this.config.binding.port,
      action: 'joined'
    };

    this.kuzzle.pluginsManager.trigger('log:info', log);

    this.lbBroker = this.kuzzle.services.list.proxyBroker;

    debug('[%s] plugin cluster connected to load balancer', this.uuid);

    // we don't use broker::unsubscribe to avoid sending a disconnection to the LB
    // that it won't be able to deal with.
    delete this.lbBroker.handlers['cluster:' + this.uuid];
    delete this.lbBroker.handlers['cluster:master'];

    this.lbBroker.listen('cluster:' + this.uuid, msg => {
      onLbMessage(this, msg);
    });
    this.lbBroker.listen('cluster:master', msg => {
      onLbMessage(this, msg);
    });

    debug('[%s] sending current node info to load balancer: %a', this.uuid, nodeInfo);
    this.lbBroker.send('cluster:join', nodeInfo);
  }

  /**
   * @param {object} diff
   */
  indexCacheAdded (diff) {
    if (!this.node || !this.node.isReady) {
      debug('[%s][warning] could not broadcast "index cache added" action: node not connected to cluster', this.uuid);
      return;
    }

    let msg = {
      icAdd: {i: diff.index, c: diff.collection}
    };

    debug('[%s] broadcasting "index cache added" action: %a', this.uuid, msg);

    this.node.broker.broadcast('cluster:update', [msg]);
  }

  /**
   * @param {object} diff
   */
  indexCacheRemoved (diff) {
    if (!this.node || !this.node.isReady) {
      debug('[%s][warning] could not broadcast "index cache removed" action: node not connected to cluster', this.uuid);
      return;
    }

    let msg = {
      icDel: {i: diff.index, c: diff.collection}
    };

    debug('[%s] broadcasting "index cache removed" action: %a', this.uuid, msg);

    this.node.broker.broadcast('cluster:update', [msg]);
  }

  /**
   * @param {object} diff
   */
  indexCacheReset (diff) {
    if (!this.node || !this.node.isReady) {
      debug('[%s][warning] could not broadcast "index cache reseted" action: node not connected to cluster', this.uuid);
      return;
    }

    let msg = {icReset: {i: diff.index}};

    debug('[%s] broadcasting "index cache reset" action: %a', this.uuid, msg);

    this.node.broker.broadcast('cluster:update', [msg]);
  }

  /**
   * @param {object} diff
   */
  profileUpdated (diff) {
    if (!this.node || !this.node.isReady) {
      debug('[%s][warning] could not broadcast "profile update" action: node not connected to cluster', this.uuid);
      return;
    }

    let msg = {
      secPU: diff
    };

    debug('[%s] broadcasting "profile update" action: %a', this.uuid, msg);
    
    this.node.broker.broadcast('cluster:update', [msg]);
  }

  /**
   * @param {object} diff
   */
  roleUpdated (diff) {
    if (!this.node || !this.node.isReady) {
      debug('[%s][warning] could not broadcast "role update" action: node not connected to cluster', this.uuid);
      return;
    }

    let msg = {
      secRU: diff
    };

    debug('[%s] broadcasting "role update" action: %a', this.uuid, msg);

    this.node.broker.broadcast('cluster:update', [msg]);
  }

  /**
   *
   * @param {Object} diff
   */
  subscriptionAdded (diff) {
    if (!this.node || !this.node.isReady) {
      debug('[%s][warning] could not broadcast "subscription added" action: node not connected to cluster', this.uuid);
      return;
    }

    debug('[%s] broadcasting "subscription added" action: %a', this.uuid, diff);

    this.node.broker.broadcast('cluster:update', diff);
  }

  /**
   * @param {Object} diff
   */
  subscriptionJoined (diff) {
    if (!this.node || !this.node.isReady) {
      debug('[%s][warning] could not broadcast "subscription joined" action: node not connected to cluster', this.uuid);
      return;
    }

    debug('[%s] broadcasting "subscription joined" action: %a', this.uuid, diff);

    this.node.broker.broadcast('cluster:update', [diff]);
  }

  /**
   * @param {{requestContext: RequestContext, roomId: string}} object
   */
  subscriptionOff (object) {
    if (!this.node || !this.node.isReady) {
      debug('[%s][warning] could not broadcast "subscription off" action: node not connected to cluster', this.uuid);
      return;
    }

    let msg = { hcDel: { c: {i: object.requestContext.connectionId, p: object.requestContext.protocol}, r: object.roomId } };

    debug('[%s] broadcasting "subscription off" action: %a', this.uuid, msg);

    this.node.broker.broadcast('cluster:update', [msg]);
  }

  /**
   * @param {Request} request
   */
  autoRefreshUpdated (request) {
    if (!this.node || !this.node.isReady) {
      debug('[%s][warning] could not broadcast "autoRefresh updated" action: node not connected to cluster', this.uuid);
      return;
    }

    if (request.input.body.autoRefresh === undefined) {
      return;
    }
    if (typeof request.input.body.autoRefresh !== 'boolean') {
      return;
    }

    let msg = {ar: {i: request.input.resource.index, v: request.input.body.autoRefresh}};

    debug('[%s] broadcasting "autoRefresh updated" action: %a', this.uuid, msg);

    this.node.broker.broadcast('cluster:update', [msg]);
  }

  refreshSpecifications () {
    if (!this.node || !this.node.isReady) {
      debug('[%s][warning] could not broadcast "refresh specifications" action: node not connected to cluster', this.uuid);
      return;
    }

    let msg = { vu: {} };

    debug('[%s] broadcasting "refresh specifications" action: %a', this.uuid, msg);

    this.node.broker.broadcast('cluster:update', [msg]);
  }

  clusterStatusAction () {
    return Promise.resolve(Object.assign({uuid: this.uuid}, this.node.clusterStatus));
  }

  log (level, msg) {
    if (this.kuzzle.pluginsManager.isInit) {
      this.kuzzle.pluginsManager.trigger(`log:${level}`, msg);
    }
    else {
      console.log(`${new Date().toISOString()} [${level}] ${msg}`); // eslint-disable-line no-console
    }
  }

}

module.exports = KuzzleCluster;

/**
 * @param {string} hostConfig
 * @returns {{host: object, port: number}}
 */
function resolveBinding (hostConfig) {
  let
    host = hostConfig,
    port = _context.accessors.kuzzle.config.services.internalBroker.port,
    match,
    iface,
    family,
    tmp;

  debug('resolving broker bindings with configuration: %a', hostConfig);

  // anything:#### case test
  match = /^(.*?)(?::(\d+))?$/.exec(hostConfig);

  if (match) {
    if (match[2]) {
      port = parseInt(match[2]);
    }
    host = match[1];

    // [eth0:ipv4] case test
    match = /^\[(.*?):(.*?)]/.exec(host);

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
 * @param {KuzzleCluster} kuzzleCluster
 * @param {string|object} msg
 */
function onLbMessage (kuzzleCluster, msg) {
  let parsed = msg;

  if (typeof msg === 'string') {
    parsed = JSON.parse(msg);
  }

  debug('[%s] received message from load balancer: %a', kuzzleCluster.uuid, parsed);

  if (parsed.action === 'joined') {
    return onJoinedLb(kuzzleCluster, parsed);
  }
  else if (parsed.action === 'ack') {
    kuzzleCluster.log('info', `[cluster] ACK for ${parsed.on} event received from LB`);
  }
  else {
    throw new InternalError(`Received unknown action from proxy "${parsed.action}"`);
  }
}

/**
 * @param {KuzzleCluster} kuzzleCluster
 * @param {object} msg
 * @returns {Promise<undefined>}
 */
function onJoinedLb (kuzzleCluster, msg) {
  if (kuzzleCluster.node) {
    kuzzleCluster.node.detach();
  }

  if (msg.uuid === kuzzleCluster.uuid) {
    kuzzleCluster.isMasterNode = true;
    kuzzleCluster.node = new MasterNode(kuzzleCluster, _context, {});
  }
  else {
    kuzzleCluster.isMasterNode = false;
    kuzzleCluster.node = new SlaveNode(kuzzleCluster, _context, {
      host: msg.host,
      port: msg.port,
      retryInterval: kuzzleCluster.config.retryInterval,
      pingTimeout: kuzzleCluster.config.pingTimeout
    });
  }

  return kuzzleCluster.node.init()
    .then(() => {
      kuzzleCluster.log('info', '[cluster] ready');

      kuzzleCluster.log('info', `[cluster] ${kuzzleCluster.uuid} joined as ${kuzzleCluster.node.constructor.name} on ${msg.host}:${msg.port}`);

      kuzzleCluster.lbBroker.send('cluster:status', {status: 'ready'});
    })
    .catch(err => {
      kuzzleCluster.log('error', `[cluster] ${kuzzleCluster.uuid} Could not join cluster.\n${err.stack}`);
      kuzzleCluster.lbBroker.send('cluster:status', {
        status: 'error',
        code: 2,
        msg: 'Error while initting the cluster node',
        originalError: err
      });
    });
}
