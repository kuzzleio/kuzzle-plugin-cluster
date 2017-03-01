'use strict';

let
  Request = require('kuzzle-common-objects').Request,
  RequestContext = require('kuzzle-common-objects').models.RequestContext;

class Node {
  constructor (cluster, context, options) {
    this.clusterHandler = cluster;
    this.context = context;
    this.options = options;

    /**
     * {Kuzzle}
     */
    this.kuzzle = context.accessors.kuzzle;

    this.clusterStatus = {};

    this.isReady = false;
  }

  addDiffListener () {
    this.broker.listen('cluster:update', this.merge.bind(this));
  }

  detach () {
    this.isReady = false;

    this.broker.unsubscribe('cluster:update');
    this.broker.unsubscribe('cluster:join');
    this.broker.unsubscribe(`cluster:${this.clusterHandler.uuid}`);
  }

  merge (diffs) {
    this.kuzzle.pluginsManager.trigger('log:debug', `[cluster:merge] ${JSON.stringify(diffs)}`);

    if (!Array.isArray(diffs)) {
      diffs = [diffs];
    }

    diffs.forEach(diff => {
      Object.keys(diff)
        .filter(k => typeof diff[k] === 'object' && !Array.isArray(diff[k]))
        .forEach(k => {
          switch (k) {
            // indexCache::add
            case 'icAdd':
              this.kuzzle.indexCache.add(diff.icAdd.i, diff.icAdd.c, false);
              break;
            // indexCache::remove
            case 'icDel':
              this.kuzzle.indexCache.remove(diff.icDel.i, diff.icDel.c, false);
              break;
            // indexCache::reset
            case 'icReset':
              this.kuzzle.indexCache.reset(diff.icReset.i, false);
              break;
            case 'hcR':
              this.mergeAddRoom(diff.hcR);
              break;
            case 'hcDel':
              this.mergeDelRoom(diff.hcDel);
              break;
            // dsl
            case 'ftAdd':
              this.kuzzle.dsl.storage.store(diff.ftAdd.i, diff.ftAdd.c, diff.ftAdd.f);
              break;
            // autoRefresh
            case 'ar':
              this.updateAutoRefresh(this.kuzzle.services.list.storageEngine, diff.ar.i, diff.ar.v);
              break;
            // validation specifications update
            case 'vu':
              this.kuzzle.validation.curateSpecification();
              break;
            // cluster status
            case 'cs':
              this.clusterStatus = diff.cs;
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
