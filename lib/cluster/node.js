var 
  RequestObject = require('kuzzle-common-objects').Models.requestObject;

function Node () { }

Node.prototype.addDiffListener = function () {
  this.broker.listen('cluster:update', merge.bind(this));
};

module.exports = Node;

function merge (diffs) {
  if (!Array.isArray(diffs)) {
    diffs = [diffs];
  }

  diffs.forEach(diff => {
    switch (Object.keys(diff)[0]) {
      case 'ic':
        mergeIndexCache.call(this, diff.ic);
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
      case 'ft':
        mergeFilterTree.call(this, diff.ft);
        break;
    }
  });
}

function mergeIndexCache (diff) {
  if (diff['+']) {
    diff['+'].forEach(o => {
      this.kuzzle.indexCache.add(o.i, o.c);
    });
  }
  if (diff['-']) {
    diff['-'].forEach(o => {
      this.kuzzle.indexCache.remove(o.i, o.c);
    });
  }
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
  this.kuzzle.dsl.filters.add(
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
}
