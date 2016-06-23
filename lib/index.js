var
  _ = require('lodash'),
  uuid = require('node-uuid'),
  hooks = require('./config/hooks'),
  MasterNode = require('./cluster/masterNode'),
  SlaveNode = require('./cluster/slaveNode'),
  _context;

function KuzzleCluster () {}

KuzzleCluster.prototype.init = function (config, context, isDummy) {

  this.config = config;
  _context = context;

  // Plugins configuration is currently stored globally for all nodes.
  // We need a per node config and at the moment, using rc capabilities is the easy way to go.
  // @todo: clean up if needed once Kuzzle configuration storage has evolved.
  if (context.accessors.kuzzle.config.cluster) {
    this.config = _.merge(this.config, context.accessors.kuzzle.config.cluster);
  }

  if (isDummy) {
    return this;
  }

  this.uuid = uuid.v1();
  _context.uuid = this.uuid;

  this.node = config.mode === 'master'
    ? new MasterNode(_context, this.config)
    : new SlaveNode(_context, this.config);

  this.hooks = hooks;

  return this;
};

KuzzleCluster.prototype.kuzzleStarted = function () {
  return this.node.init()
    .then(() => {
      _context.accessors.kuzzle.pluginsManager.trigger('log:info', '[cluster] Notification: Kuzzle is ready');
    });
};

KuzzleCluster.prototype.indexCacheAdded = function (diff) {
  if (!this.node.isReady) {
    return;
  }
  
  this.node.broker.broadcast('cluster:update', {
    icAdd: {i: diff.index, c: diff.collection}
  });
};

KuzzleCluster.prototype.indexCacheRemoved = function (diff) {
  if (!this.node.isReady) {
    return;
  }
  
  this.node.broker.broadcast('cluster:update', {
    icDel: {i: diff.index, c: diff.collection}
  });
};

KuzzleCluster.prototype.indexCacheResett = function (diff) {
  if (!this.node.isReady) {
    return;
  }
  
  this.node.broker.broadcast('cluster:update', {icReset: {i: diff.index}});
};

/**
 *
 * @param {RequestObject} requestObject
 */
KuzzleCluster.prototype.roomsRemoved = function (requestObject) {
  var
    index = requestObject.index,
    collection = requestObject.collection,
    rooms;
    
  if (!this.node.isReady) {
    return;
  }
  
  if (requestObject && requestObject.data && requestObject.data.body) {
    rooms = requestObject.data.body.rooms;
  }
  
  this.node.broker.broadcast('cluster:update', {
    hcDelMul: {
      i: index,
      c: collection,
      r: rooms
    }
  });
};

/**
 *
 * @param {Object} diff
 */
KuzzleCluster.prototype.subscriptionAdded = function (diff) {
  if (!this.node.isReady) {
    return;
  }
  
  this.node.broker.broadcast('cluster:update', diff);
};

/**
 *
 * @param {Object} diff
 */
KuzzleCluster.prototype.subscriptionJoined = function (diff) {
  if (!this.node.isReady) {
    return;
  }
  
  this.node.broker.broadcast('cluster:update', diff);
};

/**
 *
 * @param {Object} object
 */
KuzzleCluster.prototype.subscriptionOff = function (object) {
  if (!this.node.isReady) {
    return;
  }
  
  this.node.broker.broadcast('cluster:update', { hcDel: { c: object.connection, r: object.roomId } });
};

/**
 * 
 * @param {RequestObject} requestObject
 */
KuzzleCluster.prototype.autoRefreshUpdated = function (requestObject) {
  if (!this.node.isReady) {
    return;
  }
  
  if (typeof requestObject.data.body.autoRefresh !== 'boolean') {
    return;
  }
  
  this.node.broker.broadcast('cluster:update', {ar: {i: requestObject.index, v: requestObject.data.body.autoRefresh}});
};

module.exports = KuzzleCluster;

