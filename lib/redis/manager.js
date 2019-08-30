/*
 * Kuzzle, a backend software, self-hostable and ready to use
 * to power modern apps
 *
 * Copyright 2015-2018 Kuzzle
 * mailto: support AT kuzzle.io
 * website: http://kuzzle.io
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


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
      let newCursor = 0;

      return node.scan(cursor, 'MATCH', 'cluster*', 'COUNT', 1000)
        .then(response => {
          newCursor = response[0];
          const keys = response[1]
            .filter(key => key !== 'cluster:discovery' && key !== 'cluster:strategies');

          return Bluebird.map(keys, key => node.del(key));
        })
        .then(() => {
          if (parseInt(newCursor, 10) > 0) {
            return scan(node, newCursor);
          }
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
   */
  setVersion (value, index = '*', collection = '*') {
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
          this.setVersion(state.version, index, collection);
        }

        const currentRooms = new Set(this.kuzzle.realtime.getFilterIds(index, collection));

        for (const room of state.rooms) {
          currentRooms.delete(room.id);

          if (this.locks.delete.has(room.id)) {
            debugSync('being deleting room %s.. skipping update', room.id);
          } else {
            this.node.context.setRoomCount(room.filter.index, room.filter.collection, room.id, room.count);

            if (!this.kuzzle.realtime.hasFilter(room.id)) {
              debugSync('registering filter %s/%s/%s', room.filter.index, room.filter.collection, room.id);
              this.kuzzle.realtime.store({
                index: room.filter.index,
                collection: room.filter.collection,
                normalized: room.filter.filters,
                id: room.id
              });
            }
          }
        }
        // deleted rooms?
        for (const roomId of currentRooms) {
          if (this.locks.create.has(roomId)) {
            debugSync('skip deleting room %s', roomId);
          } else {
            debugSync('delete room %s', roomId);
            this.node.context.deleteRoomCount(roomId);
            this.kuzzle.realtime.remove(roomId);
          }
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

        return Bluebird.all(promises);
      })
      .then(() => this.node.sync({event: 'autorefresh'}))
      .then(() => this.node.sync({event: 'strategies'}));
  }
}

module.exports = StateManager;
