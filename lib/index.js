var
  _kuzzle,
  hooks = require('./config/hooks'),
  RequestObject = require('kuzzle-common-objects').Models.requestObject,
  ResponseObject = require('kuzzle-common-objects').Models.responseObject,
  q = require('q');

function KuzzleCluster () { }

KuzzleCluster.prototype.init = function (config, kuzzle, isDummy) {
  this.config = config;
  _kuzzle = kuzzle;

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
  return q.reject(new Error('Not implemented'));
};

/**
 *
 * @param {ResponseObject} responseObject
 * @returns {Promise}
 */
KuzzleCluster.prototype.indexCreated = function (responseObject) {
  return q.reject(new Error('Not implemented'));
};

/**
 *
 * @param {ResponseObject} responseObject
 * @returns {Promise}
 */
KuzzleCluster.prototype.indexDeleted = function (responseObject) {
  return q.reject(new Error('Not implemented'));
};

/**
 *
 * @param {ResponseObject} responseObject
 * @returns {Promise}
 */
KuzzleCluster.prototype.indiciesDeleted = function (responseObject) {
  return q.reject(new Error('Not implemented'));
};

/**
 *
 * @param {ResponseObject} responseObject
 * @returns {Promise}
 */
KuzzleCluster.prototype.mappingUpdated = function (responseObject) {
  return q.reject(new Error('Not implemented'));
};

/**
 *
 * @param {Object} diff
 * @returns {Promise}
 */
KuzzleCluster.prototype.subscriptionAdded = function (diff) {
  return q.reject(new Error('Not implemented'));
};

/**
 *
 * @param {Object} diff
 * @returns {Promise}
 */
KuzzleCluster.prototype.subscriptionJoined = function (diff) {
  return q.reject(new Error('Not implemented'));
};

/**
 *
 * @param {RequestObject} requestObject
 * @returns {Promise}
 */
KuzzleCluster.prototype.subscriptionOff = function (requestObject) {
  return q.reject(new Error('Not implemented'));
};

module.exports = KuzzleCluster;
