'use strict';

let
  debug = require('debug')('kuzzle:cluster:node'),
  debugMerge = require('debug')('kuzzle:cluster:merge'),
  Request = require('kuzzle-common-objects').Request,
  RequestContext = require('kuzzle-common-objects').models.RequestContext;

class Node {
  constructor (cluster, context, options) {
    debug('initialize cluster node');
    this.clusterHandler = cluster;
    this.context = context;
    this.options = options;
    this.broker = null;

    /**
     * {Kuzzle}
     */
    this.kuzzle = context.accessors.kuzzle;

    this.clusterStatus = {};

    this.isReady = false;
  }

  addDiffListener () {
    debug('initialize "cluster:update" listener');
    this.broker.listen('cluster:update', this.merge.bind(this));
  }

  detach () {
    debug('detach node from cluster');
    debug('%O', (new Error()).stack);

    this.isReady = false;

    if (this.broker) {
      this.broker.unsubscribe('cluster:update');
      this.broker.unsubscribe('cluster:join');
      this.broker.unsubscribe(`cluster:${this.clusterHandler.uuid}`);
    }
  }

  merge (diffs) {
    debug('cluster updated, need to merge diffs:\n%O', diffs);

    diffs.forEach(diff => {
      Object.keys(diff)
        .filter(k => typeof diff[k] === 'object' && !Array.isArray(diff[k]))
        .forEach(k => {
          switch (k) {
            // indexCache::add
            case 'icAdd':
              debugMerge('merging data "indexCache::add":\n%O', diff.icAdd);
              this.kuzzle.indexCache.add(diff.icAdd.i, diff.icAdd.c, false);
              break;
            // indexCache::remove
            case 'icDel':
              debugMerge('merging data "indexCache::remove":\n%O', diff.icDel);
              this.kuzzle.indexCache.remove(diff.icDel.i, diff.icDel.c, false);
              break;
            // indexCache::reset
            case 'icReset':
              debugMerge('merging data "indexCache::reset":\n%O', diff.icReset);
              this.kuzzle.indexCache.reset(diff.icReset.i, false);
              break;
            case 'hcR':
              debugMerge('merging data "hotelClerk::addRoom":\n%O', diff.hcR);
              this.mergeAddRoom(diff.hcR);
              break;
            case 'hcDel':
              debugMerge('merging data "hotelClerk::deleteRoom":\n%O', diff.hcDel);
              this.mergeDelRoom(diff.hcDel);
              break;
            // dsl
            case 'ftAdd':
              debugMerge('merging data "filterTree::add":\n%O', diff.ftAdd);
              this.kuzzle.dsl.storage.store(diff.ftAdd.i, diff.ftAdd.c, diff.ftAdd.f);
              break;
            // autoRefresh
            case 'ar':
              debugMerge('merging data "index::autoRefresh":\n%O', diff.ar);
              this.updateAutoRefresh(diff.ar.i, diff.ar.v);
              break;
            // validation specifications update
            case 'vu':
              debugMerge('merging data "specifications::update":\n%O', '<empty data>');
              this.kuzzle.validation.curateSpecification();
              break;
            // cluster status
            case 'cs':
              debugMerge('merging data "cluster::status":\n%O', diff.cs);
              this.clusterStatus = diff.cs;
              break;
            // profile delete & update
            case 'secPU':
              debugMerge('merging profile: %s: %O', k, diff[k]);
              delete this.kuzzle.repositories.profile.profiles[diff[k]._id];
              break;
            // role delete & update
            case 'secRU':
              debugMerge('merging role: %s: %O', k, diff[k]);
              delete this.kuzzle.repositories.role.roles[diff[k]._id];
              break;
          }
        });
    });
  }

  mergeAddRoom (diff) {
    const
      hotelClerk = this.kuzzle.hotelClerk,
      index = diff.i,
      collection = diff.c,
      channel = diff.ch,
      roomId = diff.r,
      connection = diff.cx,
      metadata = diff.m,
      request = new Request({}, {connectionId: connection.i, protocol: connection.p});

    if (!hotelClerk.rooms[roomId]) {
      hotelClerk.rooms[roomId] = {
        id: roomId,
        customers: [],
        index: index,
        channels: {},
        collection: collection
      };
    }

    if (!hotelClerk.rooms[roomId].channels[channel[0]]) {
      hotelClerk.rooms[roomId].channels[channel[0]] = channel[1];
    }

    if (!hotelClerk.customers[connection.i] || !hotelClerk.customers[connection.i][roomId]) {
      hotelClerk.addRoomForCustomer(request, roomId, metadata);
    }
  }

  mergeDelRoom (diff) {
    const
      hotelClerk = this.kuzzle.hotelClerk,
      context = new RequestContext({connectionId: diff.c.i, protocol: diff.c.p});
    hotelClerk.removeRoomForCustomer(context, diff.r, false);
  }

  updateAutoRefresh (index, value) {
    const request = new Request({
      index,
      controller: 'index',
      action: 'setAutoRefresh',
      body: {autoRefresh: value}
    });

    this.kuzzle.services.list.storageEngine.setAutoRefresh(request);
  }

}

module.exports = Node;
