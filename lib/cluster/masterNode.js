'use strict';

let
  debug = require('../kuzzleDebug')('kuzzle:cluster:node:master'),
  Promise = require('bluebird'),
  Node = require('./node');

/**
 * @class MasterNode
 */
class MasterNode extends Node {
  /**
   * @param {KuzzleCluster} cluster
   * @param {PluginContext} context
   * @param {object} options
   * @constructor
   */
  constructor (cluster, context, options) {
    super(cluster, context, options);

    this.slaves = {};
  }

  /**
   * @returns {Promise.<undefined>}
   */
  init () {
    debug('initialize master node');

    this.broker = this.kuzzle.services.list.broker;

    this.clusterStatus = {
      nodesCount: 1,
      slaves: this.slaves,
      master: {
        uuid: this.clusterHandler.uuid,
        options: {
          host: this.clusterHandler.config.binding.host,
          port: this.clusterHandler.config.binding.port,
          retryInterval: this.clusterHandler.config.retryInterval
        }
      }
    };

    this.attachEvents();
    this.isReady = true;

    return Promise.resolve();
  }

  attachEvents () {
    debug('initialize cluster listeners');
    // common listeners
    this.addDiffListener();

    // when a slave connects, send it the current full state snapshot
    this.broker.listen('cluster:join', msg => {
      debug('received slave node infos: %a', msg);

      const filters = [];
      let snapshot;

      Object.keys(this.kuzzle.dsl.storage.filters).forEach(fid => {
        const f = this.kuzzle.dsl.storage.filters[fid];
        filters.push({
          idx: f.index,
          coll: f.collection,
          f: f.filters
        });
      });

      snapshot = {
        action: 'snapshot',
        data: {
          hc: {
            r: this.kuzzle.hotelClerk.rooms,
            c: this.kuzzle.hotelClerk.customers
          },
          fs: filters,
          ic: this.kuzzle.indexCache.indexes
        }
      };

      debug('sending back a snapshot of cluster state to room "%s": %a', msg.uuid, snapshot);

      this.broker.send(`cluster:${msg.uuid}`, snapshot);


      this.slaves[msg.uuid] = msg;
      this.clusterStatus.nodesCount = Object.keys(this.slaves).length + 1;

      debug('broadcast new cluster status to room "cluster:update": %a', {cs: this.clusterStatus});

      this.broker.broadcast('cluster:update', [{cs: this.clusterStatus}]);
    });

    this.broker.onErrorHandlers.push(() => {
      debug('broker connection errored');
      this.isReady = false;
    });

    this.broker.onCloseHandlers.push(roomId => {
      debug('broker connection "%" closed', roomId);

      const id = roomId.replace(/^cluster:/, '');

      delete this.clusterStatus.slaves[id];
      this.clusterStatus.nodesCount = Object.keys(this.slaves).length + 1;

      debug('broadcast new cluster status to room "cluster:update": %a', {cs: this.clusterStatus});

      this.broker.broadcast('cluster:update', [{cs: this.clusterStatus}]);
    });

  }
}


module.exports = MasterNode;
