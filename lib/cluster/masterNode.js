'use strict';

let
  debug = require('debug')('kuzzle:cluster:node:master'),
  Promise = require('bluebird'),
  util = require('util'),
  Node = require('./node');

class MasterNode extends Node {
  constructor (cluster, context, options) {
    super(cluster, context, options);

    this.slaves = {};
  }

  init () {
    debug('initialize master node')

    this.broker = this.kuzzle.services.list.broker;

    this.attachEvents();
    this.isReady = true;

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
    return Promise.resolve();
  }

  attachEvents () {
    debug('initialize cluster listeners')
    // common listeners
    this.addDiffListener();

    // when a slave connects, send it the current full state snapshot
    this.broker.listen('cluster:join', msg => {
      debug('received slave node infos:\n%O', msg)

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
      }

      debug('sending back a snapshot of cluster state to room "%s":\n%O', msg.uuid, snapshot)

      this.broker.send(`cluster:${msg.uuid}`, snapshot);


      this.slaves[msg.uuid] = msg;
      this.clusterStatus.nodesCount = Object.keys(this.slaves).length + 1;

      debug('broadcast new cluster status to room "cluster:update":\n%O', {cs: this.clusterStatus})

      this.broker.broadcast('cluster:update', {cs: this.clusterStatus});
    });

    this.broker.onErrorHandlers.push(() => {
      debug('broker connection errored')
      this.isReady = false;
    });

    this.broker.onCloseHandlers.push(roomId => {
      debug('broker connection "%" closed', roomId)

      const id = roomId.replace(/^cluster:/, '');

      delete this.clusterStatus.slaves[id];
      this.clusterStatus.nodesCount = Object.keys(this.slaves).length + 1;

      debug('broadcast new cluster status to room "cluster:update":\n%O', {cs: this.clusterStatus})

      this.broker.broadcast('cluster:update', {cs: this.clusterStatus});
    });

  }
}


module.exports = MasterNode;
