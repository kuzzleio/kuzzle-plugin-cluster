var
  hooks = require('./config/hooks');

function KuzzleCluster () { }

KuzzleCluster.prototype.init = function (config, context, isDummy) {
  this.config = config;

  // Plugins configuration is currently stored globally for all nodes.
  // We need a per node config and at the moment, using rc capabilities is the easy way to go.
  // @todo: clean up if needed once Kuzzle configuration storage has evolved.
  if (context.kuzzle.config.cluster) {
    _.merge(this.config, context.kuzzle.config.cluster);
  }

  this.context = context;

  if (isDummy) {
    return this;
  }

  this.hooks = hooks;
};

/**
 *
 * @param {RequestObject} requestObject
 */
KuzzleCluster.prototype.roomsRemoved = function (requestObject) {
  return new Error('Not implemented');
};

/**
 *
 * @param {ResponseObject} responseObject
 */
KuzzleCluster.prototype.indexCreated = function (responseObject) {
  return new Error('Not implemented');
};

/**
 *
 * @param {ResponseObject} responseObject
 */
KuzzleCluster.prototype.indexDeleted = function (responseObject) {
  return new Error('Not implemented');
};

/**
 *
 * @param {ResponseObject} responseObject
 */
KuzzleCluster.prototype.indiciesDeleted = function (responseObject) {
  return new Error('Not implemented');
};

/**
 *
 * @param {ResponseObject} responseObject
 */
KuzzleCluster.prototype.mappingUpdated = function (responseObject) {
  return new Error('Not implemented');
};

/**
 *
 * @param {Object} diff
 */
KuzzleCluster.prototype.subscriptionAdded = function (diff) {
  return new Error('Not implemented');
};

/**
 *
 * @param {Object} diff
 */
KuzzleCluster.prototype.subscriptionJoined = function (diff) {
  return new Error('Not implemented');
};

/**
 *
 * @param {RequestObject} requestObject
 */
KuzzleCluster.prototype.subscriptionOff = function (requestObject) {
  return new Error('Not implemented');
};

module.exports = KuzzleCluster;
