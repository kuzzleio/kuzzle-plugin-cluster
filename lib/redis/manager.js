const
  Bluebird = require('bluebird'),
  debugSync = require('debug')('kuzzle:cluster:sync'),
  Redis = require('ioredis'),
  State = require('./state');

class StateManager {
  constructor (node) {
    this.node = node;
    this._versions = {'*': {'*': -1}};

    this.locks = {
      create: new Set(),
      delete: new Set()
    };
  }

  get kuzzle () {
    return this.node.kuzzle;
  }

  /**
   * gets the last version retrieved from Redis for index/collection
   *
   * @param {string} index
   * @param {string} collection
   * @returns {number}
   */
  getVersion (index = '*', collection = '*') {
    return this._versions[index] && this._versions[index][collection] || 0;
  }

  /**
   * Erases all cluster related data from Redis.
   * Can be called manually from cluster/reset action or
   * automatically on cluster init by first node
   */
  reset () {
    this._versions = {'*': {'*': -1}};
    const scan = (node, cursor) => {
      return node.scan(cursor, 'MATCH', 'cluster*', 'COUNT', 1000)
        .then(response => {
          const [newCursor, keys] = response;

          return Bluebird.all(keys
            .filter(key => key !== 'cluster:discovery')
            .map(key => node.del(key)))
            .then(() => {
              if (parseInt(newCursor) > 0) {
                return scan(node, newCursor);
              }
            });
        });
    };

    return Bluebird.resolve(this.node.redis instanceof Redis.Cluster ? this.node.redis.nodes('master') : [this.node.redis])
      .then(nodes => Bluebird.all(nodes.map(node => scan(node, 0))));
  }

  /**
   * Updates current index/collection version with the one retrieved from Redis
   *
   * @param {string} index
   * @param {string} collection
   * @param {number} value
   */
  setVersion (index = '*', collection = '*', value) {
    if (!this._versions[index]) {
      this._versions[index] = {};
    }
    this._versions[index][collection] = value;
  }

  /**
   * Fetch realtime state from Redis and updates current node
   *
   * @param {object} data
   */
  sync (data) {
    const {index, collection} = data;

    return State.current(this.node.redis, index, collection)
      .then(state => {
        if (Array.isArray(state.debug)) {
          debugSync('%o', state.debug);
        }

        {
          const currentVersion = this.getVersion(index, collection);

          if (currentVersion >= state.version
            && state.version !== 1
            && (!data || data.post !== 'reset')
          ) {
            debugSync('no new state version received... skipping: %d/%d %o', currentVersion, state.version, data);
            return;
          }

          debugSync('%d/%d %o', currentVersion, state.version, data);
          this.setVersion(index, collection, state.version);
        }

        const currentRooms = new Set(this.kuzzle.realtime.storage.filtersIndex[index]
          && this.kuzzle.realtime.storage.filtersIndex[index][collection]
          || []);

        for (const room of state.rooms) {
          currentRooms.delete(room.id);

          if (this.locks.delete.has(room.id)) {
            debugSync('being deleting room %s.. skipping update', room.id);
            continue;
          }

          this.node.context.setRoomCount(room.filter.index, room.filter.collection, room.id, room.count);

          if (!this.kuzzle.realtime.storage.filters[room.id]) {
            debugSync('registering filter %s/%s/%s', room.filter.index, room.filter.collection, room.id);
            this.kuzzle.realtime.storage.store(room.filter.index, room.filter.collection, room.filter.filters, room.id);
          }
        }

        // deleted rooms?
        for (const roomId of currentRooms) {
          if (this.locks.create.has(roomId)) {
            debugSync('skip deleting room %s', roomId);
            continue;
          }

          debugSync('delete room %s', roomId);
          this.node.context.deleteRoomCount(roomId);
          this.kuzzle.realtime.remove(roomId);
        }
      });
  }

  /**
   * Updates realtime state for all collections
   *
   * @param {object} data
   */
  syncAll (data) {
    const promises = [];

    return this.node.redis
      .smembers('cluster:collections')
      .then(tags => {
        for (const tag of tags) {
          const [index, collection] = tag.split('/');
          promises.push(this.sync(Object.assign({}, data, {index, collection})));
        }
      })
      .then(() => Bluebird.all(promises))
      .then(() => this.node.sync({event: 'autorefresh'}));
  }
}

module.exports = StateManager;
