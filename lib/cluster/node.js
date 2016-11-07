var 
  RequestObject = require('kuzzle-common-objects').Models.requestObject;

function Node (clusterHandler, context, options) {
  this.clusterHandler = clusterHandler;
  this.context = context;
  this.options = options;

  this.kuzzle = context.accessors.kuzzle;

  this.clusterStatus = {};

  this.isReady = false;
}

Node.prototype.addDiffListener = function () {
  this.broker.listen('cluster:update', merge.bind(this));
};

Node.prototype.destroy = function () {
  this.broker.reconnect = false;
  this.broker.close();
  
  this.isReady = false;
};

module.exports = Node;

function merge (diffs) {
  this.kuzzle.pluginsManager.trigger('log:debug', `[cluster::merge] ${JSON.stringify(diffs)}`);

  if (!Array.isArray(diffs)) {
    diffs = [diffs];
  }

  diffs.forEach(diff => {
    switch (Object.keys(diff)[0]) {
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
        mergeAddRoom.call(this, diff.hcR);
        break;
      case 'hcDel':
        mergeDelRoom.call(this, diff.hcDel);
        break;
      case 'hcDelMul':
        mergeDelRooms.call(this, diff.hcDelMul);
        break;
      // filterTree
      case 'ft':
        mergeFilterTree.call(this, diff.ft);
        break;
      // filterTree global subscription
      case 'ftG':
        this.kuzzle.dsl.filters.addCollectionSubscription(diff.ftG.fi, diff.ftG.i, diff.ftG.c);
        break;
      // autoRefresh
      case 'ar':
        updateAutoRefresh.call(this, diff.ar.i, diff.ar.v);
        break;
      // validation   update
      case 'vu':
        updateValidationSpecification.call(this);
        break;
      // cluster status
      case 'cs':
        this.clusterStatus = diff.cs;
        break;
    }
  });
}

function mergeAddRoom (diff) {
  var
    index = diff.i,
    collection = diff.c,
    channel = diff.ch,
    roomId = diff.r,
    connection = diff.cx,
    metadata = diff.m;

  if (!this.kuzzle.hotelClerk.rooms[roomId]) {
    this.kuzzle.hotelClerk.rooms[roomId] = {
      id: roomId,
      customers: [],
      index: index,
      channels: {},
      collection: collection
    };
  }

  if (!this.kuzzle.hotelClerk.rooms[roomId].channels[channel[0]]) {
    this.kuzzle.hotelClerk.rooms[roomId].channels[channel[0]] = channel[1];
  }

  if (!this.kuzzle.hotelClerk.customers[connection.id] || !this.kuzzle.hotelClerk.customers[connection.id][roomId]) {
    this.kuzzle.hotelClerk.addRoomForCustomer(connection, roomId, metadata);
  }
}

function mergeDelRoom (diff) {
  this.kuzzle.hotelClerk.removeRoomForCustomer(diff.c, diff.r, false);
}

function mergeDelRooms (diff) {
  var requestObject = new RequestObject(
    { index: diff.i, collection: diff.c },
    { body: { rooms: diff.r } }
  );
  
  this.kuzzle.hotelClerk.removeRooms(requestObject);
}

function mergeFilterTree (diff) {
  var result = this.kuzzle.dsl.filters.add(
    diff.i,
    diff.c,
    diff.f,
    diff.o,
    diff.v,
    diff.fn,
    diff.fi,
    diff.n,
    diff.g
  );
  this.kuzzle.dsl.filters.filters[diff.fi] = {
    index: diff.i,
    collection: diff.c,
    encodedFilters: {
      [result.path]: result.filter
    }
  };
}

function updateAutoRefresh (index, value) {
  var requestObject = new RequestObject({
    index,
    controller: 'admin',
    action: 'setAutoRefresh'
  }, {
    body: {autoRefresh: value}
  });

  this.kuzzle.services.list.storageEngine.setAutoRefresh(requestObject);
}

function updateValidationSpecification () {
  this.kuzzle.validation.curateSpecification();
}

