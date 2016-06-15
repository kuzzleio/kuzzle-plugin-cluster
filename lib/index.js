var
  _ = require('lodash'),
  uuid = require('node-uuid'),
  hooks = require('./config/hooks'),
  MasterNode = require('./cluster/masterNode'),
  SlaveNode = require('./cluster/slaveNode'),
  _context;

function KuzzleCluster () {
  this.isReady = false;
}

KuzzleCluster.prototype.init = function (config, context, isDummy) {

  this.config = config;
  _context = context;

  // Plugins configuration is currently stored globally for all nodes.
  // We need a per node config and at the moment, using rc capabilities is the easy way to go.
  // @todo: clean up if needed once Kuzzle configuration storage has evolved.
  if (context.kuzzle.config.cluster) {
    this.config = _.merge(this.config, context.kuzzle.config.cluster);
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
      this.isReady = true;
    });
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
    
  if (!this.isReady) {
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
 * @param {ResponseObject} responseObject
 */
KuzzleCluster.prototype.indexCreated = function (responseObject) {
  var index;
  
  if (!this.isReady) {
    return;
  }

  if (responseObject && responseObject.result && responseObject.result.acknowledged) {
    index = responseObject.index;
  }

  if (index) {
    this.node.broker.broadcast('cluster:update', {
      ic: { '+': [{i: index}] }
    });
  }
};

/**
 *
 * @param {ResponseObject} responseObject
 */
KuzzleCluster.prototype.indexDeleted = function (responseObject) {
  var index;
  
  if (!this.isReady) {
    return;
  }
  
  if (responseObject && responseObject.result && responseObject.result.acknowledged) {
    index = responseObject.index;
  }
  
  if (index) {
    this.node.broker.broadcast('cluster:update', {
      ic: { '-': [{i: index}] }
    });
  }
};

/**
 *
 * @param {ResponseObject} responseObject
 */
KuzzleCluster.prototype.indiciesDeleted = function (responseObject) {
  var indices;
  
  if (!this.isReady) {
    return;
  }
  
  if (responseObject && responseObject.result && responseObject.result.deleted) {
    indices = responseObject.result.deleted;
  }
  
  if (Array.isArray(indices) && indices.length) {
    this.node.broker.broadcast('cluster:update', {
      ic: { '-': indices.map(index => { return {i: index}; })}
    });
  }
};

/**
 *
 * @param {ResponseObject} responseObject
 */
KuzzleCluster.prototype.mappingUpdated = function (responseObject) {
  if (!this.isReady) {
    return;
  }
  
  this.node.broker.broadcast('cluster:update', {
    ic: { '+': [ {i: responseObject.index, c: responseObject.collection} ] }
  });
};

/**
 *
 * @param {Object} diff
 */
KuzzleCluster.prototype.subscriptionAdded = function (diff) {
  if (!this.isReady) {
    return;
  }
  
  this.node.broker.broadcast('cluster:update', diff);
};

/**
 *
 * @param {Object} diff
 */
KuzzleCluster.prototype.subscriptionJoined = function (diff) {
  if (!this.isReady) {
    return;
  }
  
  this.node.broker.broadcast('cluster:update', diff);
};

/**
 *
 * @param {Object} object
 */
KuzzleCluster.prototype.subscriptionOff = function (object) {
  if (!this.isReady) {
    return;
  }
  
  this.node.broker.broadcast('cluster:update', { hcDel: { c: object.connection, r: object.roomId } });
};

module.exports = KuzzleCluster;

