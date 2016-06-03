var
  _ = require('lodash'),
  q = require('q'),
  hooks = require('./config/hooks'),
  MasterNode = require('./cluster/masterNode'),
  SlaveNode = require('./cluster/slaveNode'),
  _context,
  _kuzzle;

function KuzzleCluster () { }

KuzzleCluster.prototype.init = function (config, context, isDummy) {
  this.config = config;
  _context = context;
  _kuzzle = context.kuzzle;

  // Plugins configuration is currently stored globally for all nodes.
  // We need a per node config and at the moment, using rc capabilities is the easy way to go.
  // @todo: clean up if needed once Kuzzle configuration storage has evolved.
  if (context.kuzzle.config.cluster) {
    _.merge(this.config, context.kuzzle.config.cluster);
  }

  if (isDummy) {
    return this;
  }

  this.uuid = uuid.v1();
  _context.uuid = this.uuid;

  this.node = options.mode === 'master'
    ? new MasterNode(this, _context, this.config)
    : new SlaveNode(this, _context, this.config);
  this.node.init();

  this.hooks = hooks;

  return this;
};

/**
 *
 * @param {RequestObject} requestObject
 */
KuzzleCluster.prototype.roomsRemoved = function (requestObject) {
  this.broker.broadcast('cluster:')
};

/**
 *
 * @param {ResponseObject} responseObject
 */
KuzzleCluster.prototype.indexCreated = function (responseObject) {
  this.broker.broadcast('cluster:update', {
    ic: { '+': [ {i: responseObject.index} ] }
  });
};

/**
 *
 * @param {ResponseObject} responseObject
 */
KuzzleCluster.prototype.indexDeleted = function (responseObject) {
  this.broker.broadcast('cluster:update', {
    ic: { '-': [ {i: responseObject.index} ] }
  });
};

/**
 *
 * @param {ResponseObject} responseObject
 */
KuzzleCluster.prototype.indiciesDeleted = function (responseObject) {
  this.broker.broadcast('cluster:update', {
    ic: { '-': responseObject.result.deleted.map(index => {i:index}) }
  });
};

/**
 *
 * @param {ResponseObject} responseObject
 */
KuzzleCluster.prototype.mappingUpdated = function (responseObject) {
  this.broker.broadcast('cluster:update', {
    ic: { '+': [ {i: responseObject.index, c: responseObject.collection} ] }
  });
};

/**
 *
 * @param {Object} diff
 */
KuzzleCluster.prototype.subscriptionAdded = function (diff) {
  this.broker.broadcast('cluster:update', diff);
};

/**
 *
 * @param {Object} diff
 */
KuzzleCluster.prototype.subscriptionJoined = function (diff) {
  this.broker.broadcast('cluster:update', diff);
};

/**
 *
 * @param {Object} object
 */
KuzzleCluster.prototype.subscriptionOff = function (object) {
  this.broker.broadcast('cluster:update', { hcDel: { c: object.connection, r: object.roomId  } });
};

module.exports = KuzzleCluster;

function runControllerAction (requestObject) {
  var
    controllers = _kuzzle.funnelController.controllers;

  return (() => {
    _kuzzle.statistics.startRequest(requestObject);

    if (!controllers[requestObject.controller] ||
      !controllers[requestObject.controller][requestObject.action] ||
      typeof controllers[requestObject.controller][requestObject.action] !== 'function') {
      return q.reject(new BadRequestError('No corresponding action ' + requestObject.action + ' in controller ' + requestObject.controller));
    }

    // NB: We don't have the context here, we can only call actions that to not need it
    return controllers[requestObject.controller][requestObject.action](requestObject);
  })()
    .then(responseObject => {
      _kuzzle.statistics.completedRequest(requestObject);
      return responseObject;
    })
    .catch(error => {
      _kuzzle.statistics.failedRequest(requestObject);
      return q.reject(error);
    };
}
