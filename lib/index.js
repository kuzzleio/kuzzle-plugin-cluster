'use strict';

let
  _ = require('lodash'),
  debug = require('debug')('kuzzle:cluster'),
  os = require('os'),
  InternalError = require('kuzzle-common-objects').errors.InternalError,
  MasterNode = require('./cluster/masterNode'),
  SlaveNode = require('./cluster/slaveNode'),
  _context;

class KuzzleCluster {

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

  init (customConfig, context) {
    let defaultConfig = {
      'binding': '[eth0:ipv4]:7911',
      'retryInterval': 2000
    };
    this.config = Object.assign(defaultConfig, customConfig);

    _context = context;

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

    this.kuzzle.cluster = this;

    debug('[%s] plugin cluster initialized with config:\n%O', this.uuid, this.config);

    return this;
  }

  connectedToLB () {
    let log = '[cluster] "Connected to load balancer" event received';
    let nodeInfo = {
      uuid: this.uuid,
      host: this.config.binding.host,
      port: this.config.binding.port,
      action: 'joined'
    }

    this.kuzzle.pluginsManager.trigger('log:info', log);

    this.lbBroker = this.kuzzle.services.list.proxyBroker;

    debug('[%s] plugin cluster connected to load balancer', this.uuid);

    // we don't use broker::unsubscribe to avoid sending a disconnection to the LB
    // that it won't be able to deal with.
    delete this.lbBroker.handlers['cluster:' + this.uuid];
    delete this.lbBroker.handlers['cluster:master'];

    this.lbBroker.listen('cluster:' + this.uuid, onLbMessage.bind(this));
    this.lbBroker.listen('cluster:master', onLbMessage.bind(this));

    debug('[%s] sending current node info to load balancer:\n%O', this.uuid, nodeInfo);

    this.lbBroker.send('cluster:join', nodeInfo);
  }

  indexCacheAdded (diff) {
    if (!this.node || !this.node.isReady) {
      debug('[%s][warning] could not broadcast "index cache added" action: node not connected to cluster', this.uuid);
      return;
    }

    let msg = {
      icAdd: {i: diff.index, c: diff.collection}
    }

    debug('[%s] broadcasting "index cache added" action:\n%O', this.uuid, msg);

    this.node.broker.broadcast('cluster:update', msg);
  }

  indexCacheRemoved (diff) {
    if (!this.node || !this.node.isReady) {
      debug('[%s][warning] could not broadcast "index cache removed" action: node not connected to cluster', this.uuid);
      return;
    }

    let msg = {
      icDel: {i: diff.index, c: diff.collection}
    }

    debug('[%s] broadcasting "index cache removed" action:\n%O', this.uuid, msg);

    this.node.broker.broadcast('cluster:update', msg);
  }

  indexCacheReset (diff) {
    if (!this.node || !this.node.isReady) {
      debug('[%s][warning] could not broadcast "index cache reseted" action: node not connected to cluster', this.uuid);
      return;
    }

    let msg = {icReset: {i: diff.index}}

    debug('[%s] broadcasting "index cache reseted" action:\n%O', this.uuid, msg);

    this.node.broker.broadcast('cluster:update', msg);
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

    debug('[%s] broadcasting "subscription added" action:\n%O', this.uuid, diff);

    this.node.broker.broadcast('cluster:update', diff);
  }

  /**
   *
   * @param {Object} diff
   */
  subscriptionJoined (diff) {
    if (!this.node || !this.node.isReady) {
      debug('[%s][warning] could not broadcast "subscription joined" action: node not connected to cluster', this.uuid);
      return;
    }

    debug('[%s] broadcasting "subscription joined" action:\n%O', this.uuid, diff);

    this.node.broker.broadcast('cluster:update', diff);
  }

  /**
   *
   * @param {{requestContext: RequestContext, roomId: string}} object
   */
  subscriptionOff (object) {
    if (!this.node || !this.node.isReady) {
      debug('[%s][warning] could not broadcast "subscription off" action: node not connected to cluster', this.uuid);
      return;
    }

    let msg = { hcDel: { c: {i: object.requestContext.connectionId, p: object.requestContext.protocol}, r: object.roomId } }

    debug('[%s] broadcasting "subscription off" action:\n%O', this.uuid, msg);

    this.node.broker.broadcast('cluster:update', msg);
  }

  /**
   *
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

    let msg = {ar: {i: request.input.resource.index, v: request.input.body.autoRefresh}}

    debug('[%s] broadcasting "autoRefresh updated" action:\n%O', this.uuid, msg);

    this.node.broker.broadcast('cluster:update', msg);
  }

  refreshSpecifications () {
    if (!this.node || !this.node.isReady) {
      debug('[%s][warning] could not broadcast "refresh specifications" action: node not connected to cluster', this.uuid);
      return;
    }

    let msg = { vu: {} }

    debug('[%s] broadcasting "refresh specifications" action:\n%O', this.uuid, msg);

    this.node.broker.broadcast('cluster:update', msg);
  }

  clusterStatusAction () {
    return Promise.resolve(Object.assign({uuid: this.uui}, this.node.clusterStatus));
  }

  log (level, msg) {
    if (this.kuzzle.pluginsManager.isInit) {
      this.kuzzle.pluginsManager.trigger(`log:${level}`, msg);
    }
    else {
      console.log(`${new Date().toISOString()} [${level}] ${msg}`);   // eslint-disable-line no-console
    }
  }

}

module.exports = KuzzleCluster;

function resolveBinding (config) {
  let
    host = config,
    port = _context.accessors.kuzzle.config.services.internalBroker.port,
    match,
    iface,
    family,
    tmp;

  debug('[%s] resolving broker bindings with configuration:\n%O', config);

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
  let parsed = JSON.parse(msg)

  debug('[%s] received message from load balancer:\n%O', parsed);

  if (parsed.action === 'joined') {
    return onJoinedLb.call(this, parsed);
  }
  else if (parsed.action === 'ack') {
    this.log('info', `[cluster] ACK for ${parsed.on} event received from LB`);
  }
  else {
    throw new InternalError(`Received unkwnon action from proxy "${parsed.action}"`)
  }
}

/**
 * @this KuzzleCluster
 * @param msg
 * @returns {Promise<any>|Promise.<T>}
 */
function onJoinedLb (msg) {
  debug('[%s] received "joined" action from load balancer:\n%O', msg);

  if (this.node) {
    this.node.detach();
  }

  if (msg.uuid === this.uuid) {
    this.isMasterNode = true;
    this.node = new MasterNode(this, _context, {});
  }
  else {
    this.isMasterNode = false;
    this.node = new SlaveNode(this, _context, {
      host: msg.host,
      port: msg.port,
      retryInterval: this.config.retryInterval
    });
  }

  return this.node.init()
    .then(() => {
      this.log('info', '[cluster] ready');

      this.log('info', `[cluster] ${this.uuid} joined as ${this.node.constructor.name} on ${msg.host}:${msg.port}`);

      this.lbBroker.send('cluster:status', {status: 'ready'});
    })
    .catch(err => {
      this.log('error', `[cluster] ${this.uuid} Could not join cluster.\n${err.stack}`);
      this.lbBroker.send('cluster:status', {
        status: 'error',
        code: 2,
        msg: 'Error while initting the cluster node',
        originalError: err
      });
    });
}
