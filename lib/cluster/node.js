'use strict';

var
  Request = require('kuzzle-common-objects').Request,
  RequestContext = require('kuzzle-common-objects').models.RequestContext;

function Node (clusterHandler, context, options) {
  this.clusterHandler = clusterHandler;
  this.context = context;
  this.options = options;

  this.kuzzle = context.accessors.kuzzle;

  this.clusterStatus = {};

  this.isReady = false;
}

Node.prototype.addDiffListener = function addDiffListener () {
  this.broker.listen('cluster:update', this.merge.bind(this));
};

Node.prototype.destroy = function destroy () {
  this.broker.reconnect = false;
  this.broker.close();

  this.isReady = false;
};

Node.prototype.merge = function merge (diffs) {
  this.kuzzle.pluginsManager.trigger('log:debug', `[cluster:merge] ${JSON.stringify(diffs)}`);
  console.log('DEBUG "cluster:update":', diffs)

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
            mergeAddRoom(this.kuzzle.hotelClerk, diff.hcR);
            break;
          case 'hcDel':
            mergeDelRoom(this.kuzzle.hotelClerk, diff.hcDel);
            break;
          // dsl
          case 'ftAdd':
            this.kuzzle.dsl.storage.store(diff.ftAdd.i, diff.ftAdd.c, diff.ftAdd.f);
            break;
          // autoRefresh
          case 'ar':
            updateAutoRefresh(this.kuzzle.services.list.storageEngine, diff.ar.i, diff.ar.v);
            break;
          // validation specifications update
          case 'vu':
            updateValidationSpecification(this.kuzzle.validation);
            break;
          // cluster status
          case 'cs':
            this.clusterStatus = diff.cs;
            break;
        }
      });
  });
};

function mergeAddRoom (hotelClerk, diff) {
  var
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

function mergeDelRoom (hotelClerk, diff) {
  var context = new RequestContext({connectionId: diff.c.i, protocol: diff.c.p});
  hotelClerk.removeRoomForCustomer(context, diff.r, false);
}

function updateAutoRefresh (storageEngine, index, value) {
  var request = new Request({
    index,
    controller: 'index',
    action: 'setAutoRefresh',
    body: {autoRefresh: value}
  });
  console.log('DEBUG: "updateAutoRefresh 2/2"', index, value)

  storageEngine.setAutoRefresh(request);
}

function updateValidationSpecification (validation) {
  validation.curateSpecification();
}

module.exports = Node;
