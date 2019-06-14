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


'use strict';

const
  Bluebird = require('bluebird'),
  debug = require('debug')('kuzzle:cluster'),
  fs = require('fs'),
  ip = require('ip'),
  Node = require('./node'),
  path = require('path'),
  IORedis = require('ioredis'),
  Request = require('kuzzle-common-objects').Request,
  uuid = require('uuid/v4'),
  url = require('url');

IORedis.Promise = Bluebird;

class KuzzleCluster {

  /**
   * @constructor
   */
  constructor () {
    this.config = null;
    /** @type {PluginContext} */
    this.context = null;
    this.kuzzle = null;
    this.uuid = null;
    this.node = null;

    this.hooks = {
      'core:auth:strategyAdded': 'strategyAdded',
      'core:auth:strategyRemoved': 'strategyRemoved',
      'core:kuzzleStart': 'kuzzleStarted',
      'core:indexCache:add': 'indexCacheAdded',
      'core:indexCache:remove': 'indexCacheRemoved',
      'core:indexCache:reset': 'indexCacheReset',
      'core:notify:document': 'notifyDocument',
      'core:notify:user': 'notifyUser',
      'core:hotelClerk:addSubscription': 'subscriptionAdded',
      'core:hotelClerk:removeRoomForCustomer': 'subscriptionOff',
      'core:hotelClerk:join': 'subscriptionJoined',
      'core:profileRepository:save': 'profileUpdated',
      'core:profileRepository:delete': 'profileUpdated',
      'core:roleRepository:save': 'roleUpdated',
      'core:roleRepository:delete': 'roleUpdated',
      'index:afterSetAutoRefresh': 'autoRefreshUpdated',
      'collection:afterUpdateSpecifications': 'refreshSpecifications',
      'collection:afterDeleteSpecifications': 'refreshSpecifications',
      'realtime:errorSubscribe': 'unlockCreateRoom',
      'realtime:errorUnsubscribe': 'unlockDeleteRoom',
      'room:new': 'roomCreated',
      'room:remove': 'roomDeleted',
      'admin:afterResetSecurity': 'resetSecurityCache',
      'admin:afterDump': 'dump',
      'admin:afterShutdown': 'shutdown'
    };

    this.pipes = {
      'realtime:beforeJoin': 'beforeJoin'
    };

    this.routes = [
      {verb: 'get', url: '/health', controller: 'cluster', action: 'health'},
      {verb: 'post', url: '/reset', controller: 'cluster', action: 'reset'},
      {verb: 'get', url: '/status', controller: 'cluster', action: 'status'}
    ];

    this.controllers = {
      cluster: {
        health: 'clusterHealthAction',
        reset: 'clusterResetAction',
        status: 'clusterStatusAction'
      }
    };

    this.node = new Node(this);

    this._isKuzzleStarted = false;

    this._waitingForRooms = {};

    this._rooms = {
      flat: {},
      tree: {}
    };

    this._shutdown = false;
  }

  /**
   * @param {object} config
   * @param {PluginContext} context
   * @returns {KuzzleCluster}
   */
  init (config, context) {
    this.context = context;
    this.kuzzle = context.accessors.kuzzle;

    const mergedConfig = Object.assign({
      bindings: {
        pub: 'tcp://[_site_:ipv4]:7511',
        router: 'tcp://[_site_:ipv4]:7510'
      },
      minimumNodes: 1,
      redis: this.kuzzle.config.services.internalCache.nodes || this.kuzzle.config.services.internalCache.node,
      retryJoin: 30,
      timers: {
        discoverTimeout: 3000,
        joinAttemptInterval: 2000,
        heartbeat: 5000,
        waitForMissingRooms: 4500
      }
    }, config || {});
    mergedConfig.bindings.pub = this.constructor._resolveBinding(mergedConfig.bindings.pub, 7511);
    mergedConfig.bindings.router = this.constructor._resolveBinding(mergedConfig.bindings.router, 7510);

    this.config = mergedConfig;

    this._registerShutdownListeners();

    this.uuid = uuid();

    this.redis = Array.isArray(this.config.redis) ? new IORedis.Cluster(this.config.redis) : new IORedis(this.config.redis);

    this.redis.defineCommand('clusterCleanNode', {
      numberOfKeys: 1,
      lua: fs.readFileSync(path.resolve(__dirname, 'redis/cleanNode.lua'))
    });
    this.redis.defineCommand('clusterState', {
      numberOfKeys: 1,
      lua: fs.readFileSync(path.resolve(__dirname, 'redis/getState.lua'))
    });
    this.redis.defineCommand('clusterSubOn', {
      numberOfKeys: 1,
      lua: fs.readFileSync(path.resolve(__dirname, 'redis/subon.lua'))
    });
    this.redis.defineCommand('clusterSubOff', {
      numberOfKeys: 1,
      lua: fs.readFileSync(path.resolve(__dirname, 'redis/suboff.lua'))
    });

    return this;
  }

  // --------------------------------------------------------------------------
  // hooks
  // --------------------------------------------------------------------------

  /**
   * @param {Request} request
   */
  autoRefreshUpdated (request) {
    if (!this.node.ready) {
      debug('[%s][warning] could not broadcast "autoRefresh updated" action: node not connected to cluster', this.uuid);
      return;
    }

    return this.redis.hset('cluster:autorefresh', request.input.resource.index, request.input.body.autoRefresh)
      .then(() => this.node.broadcast('cluster:sync', {
        event: 'autorefresh'
      }));
  }

  /**
   * @param {Request} request
   * @param {function} cb callback
   * @param {integer} attempts
   */
  beforeJoin (request, cb, attempts = 0) {
    if (!request.input.body || !request.input.body.roomId) {
      return cb(null, request);
    }

    const roomId = request.input.body.roomId;

    if (this.kuzzle.hotelClerk.rooms[roomId]) {
      return cb(null, request);
    }

    if (this._rooms.flat[roomId]) {
      const room = this._rooms.flat[roomId];

      this.kuzzle.hotelClerk.rooms[roomId] = {
        index: room.index,
        collection: room.collection,
        id: roomId,
        customers: new Set(),
        channels: {}
      };

      return cb(null, request);
    }

    // room not found. May be normal but can also be due to cluster state propagation delay
    if (attempts > 0) {
      return cb(null, request);
    }

    setTimeout(() => this.beforeJoin(request, cb, attempts + 1), this.config.timers.waitForMissingRooms);
  }

  /**
   * @param {object} diff
   */
  indexCacheAdded (diff) {
    if (!this.node.ready) {
      debug('[%s][warning] could not broadcast "index cache added" action: node not connected to cluster', this.uuid);
      return;
    }

    this.node.broadcast('cluster:sync', {
      event: 'indexCache:add',
      index: diff.index,
      collection: diff.collection
    });
  }

  /**
   * @param {object} diff
   */
  indexCacheRemoved (diff) {
    if (!this.node.ready) {
      debug('[%s][warning] could not broadcast "index cache removed" action: node not connected to cluster', this.uuid);
      return;
    }

    this.node.broadcast('cluster:sync', {
      event: 'indexCache:remove',
      index: diff.index,
      collection: diff.collection
    });
  }

  indexCacheReset () {
    if (!this.node.ready) {
      debug('[%s][warning] could not broadcast "index cache reseted" action: node not connected to cluster', this.uuid);
      return;
    }

    this.node.broadcast('cluster:sync', {
      event: 'indexCache:reset'
    });
  }

  kuzzleStarted () {
    this.kuzzle.funnel.controllers.realtime.count = request => this._realtimeCountOverride(request);

    this.kuzzle.funnel.controllers.realtime.list = request => this._realtimeListOverride(request);

    this.kuzzle.realtime.storage.remove = id => {
      if (this._rooms.flat[id] && this._rooms.flat[id].count > 1) {
        debug('[realtime.storage.remove] do not delete room %s', id);
        return;
      }

      debug('[realtime.storage.remove] delete room %s', id);
      return this.kuzzle.realtime.storage.constructor.prototype.remove.call(this.kuzzle.realtime.storage, id);
    };

    // register existing strategies
    const promises = [];
    for (const name of this.kuzzle.pluginsManager.listStrategies()) {
      const strategy = this.kuzzle.pluginsManager.strategies[name];

      promises.push(this.redis.hset('cluster:strategies', name, JSON.stringify({
        plugin: strategy.owner,
        strategy: strategy.strategy
      })));
    }
    return Bluebird.all(promises)
      .then(() => {
        this._isKuzzleStarted = true;
        return this.node.init();
      });
  }

  notifyDocument (data) {
    if (!this.node.ready) {
      debug('[%s][warning] could not broadcast document notification: node not connected to cluster', this.uuid);
      return;
    }

    this.node.broadcast('cluster:notify:document', data);
  }

  notifyUser (data) {
    if (!this.node.ready) {
      debug('[%s][warning] could not broadcast user notification: node not connected to cluster', this.uuid);
      return;
    }

    this.node.broadcast('cluster:notify:user', data);
  }

  /**
   * @param {object} diff
   */
  profileUpdated (diff) {
    if (!this.node.ready) {
      debug('[%s][warning] could not broadcast "profile update" action: node not connected to cluster', this.uuid);
      return;
    }

    this.node.broadcast('cluster:sync', {
      event: 'profile',
      id: diff._id
    });
  }

  refreshSpecifications () {
    if (!this.node.ready) {
      debug('[%s][warning] could not broadcast "refresh specifications" action: node not connected to cluster', this.uuid);
      return;
    }

    this.node.broadcast('cluster:sync', {
      event: 'validators'
    });
  }

  /**
   * @param {object} diff
   */
  roleUpdated (diff) {
    if (!this.node.ready) {
      debug('[%s][warning] could not broadcast "role update" action: node not connected to cluster', this.uuid);
      return;
    }

    this.node.broadcast('cluster:sync', {
      event: 'role',
      id: diff._id
    });
  }

  roomCreated (payload) {
    this.node.state.locks.create.add(payload.roomId);
  }

  roomDeleted (roomId) {
    this.node.state.locks.delete.add(roomId);
  }

  strategyAdded (payload) {
    if (!this.node.ready) {
      debug('[%s][warning] could not broadcast "strategy added" action: node not connected to cluster', this.uuid);
      return;
    }

    return this.redis.hset('cluster:strategies', payload.name, JSON.stringify({
      plugin: payload.pluginName,
      strategy: payload.strategy
    }))
      .then(() => this.node.broadcast('cluster:sync', {
        event: 'strategies'
      }));
  }

  strategyRemoved (payload) {
    if (!this.node.ready) {
      debug('[%s][warning] could not broadcast "strategy added" action: node not connected to cluster', this.uuid);
      return;
    }

    return this.redis.hdel('cluster:strategies', payload.name)
      .then(() => this.node.broadcast('cluster:sync', {
        event: 'strategies'
      }));
  }

  subscriptionAdded (diff) {
    if (!this.node.ready) {
      debug('[%s][warning] could not broadcast "subscription added" action: node not connected to cluster', this.uuid);
      return;
    }

    const
      {
        index,
        collection,
        filters,
        roomId,
        connectionId
      } = diff,
      filter = {
        index,
        collection,
        filters
      },
      serializedFilter = filters && JSON.stringify(filter) || 'none';

    debug('[hook] sub add %s/%s', roomId, connectionId);

    let result;
    return this.redis.clusterSubOn(
      `{${index}/${collection}}`,
      this.uuid,
      roomId,
      connectionId,
      serializedFilter
    )
      .then(r => {result = r;})
      .then(() => this.redis.sadd('cluster:room_ids', roomId))
      .then(() => this.redis.sadd('cluster:collections', `${index}/${collection}`))
      .then(() => this._onSubOn('add', index, collection, roomId, result))
      .finally(() => this.node.state.locks.create.delete(roomId));
  }

  subscriptionJoined (diff) {
    if (!this.node.ready) {
      debug('[%s][warning] could not broadcast "subscription joined" action: node not connected to cluster', this.uuid);
      return;
    }

    const
      {
        index,
        collection,
        roomId,
        connectionId
      } = diff;

    if (diff.changed === false) {
      debug('[hook][sub joined] no change');
      return;
    }


    debug('[hook] sub join %s/%s %d', roomId, connectionId, this.kuzzle.hotelClerk.rooms[roomId].customers.size);

    return this.redis.clusterSubOn(
      `{${index}/${collection}}`,
      this.uuid,
      roomId,
      connectionId,
      'none'
    )
      .then(result => this._onSubOn('join', index, collection, roomId, result));
  }

  subscriptionOff (object) {
    if (!this.node.ready) {
      debug('[%s][warning] could not broadcast "subscription off" action: node not connected to cluster', this.uuid);
      return;
    }

    const
      room = object.room,
      {index, collection} = room,
      connectionId = object.requestContext.connectionId;

    debug('[hook] sub off %s/%s', room.id, connectionId);

    return this.redis.clusterSubOff(
      `{${room.index}/${room.collection}}`,
      this.uuid,
      room.id,
      connectionId
    )
      .then(result => {
        if (result[1] === '0') {
          return this.redis.srem('cluster:room_ids', room.id)
            .then(() => result);
        }

        return result;
      })
      .then(result => {
        const
          [version, count, dbg] = result;

        if (this.node.state.getVersion(index, collection) < version) {
          this.setRoomCount(index, collection, room.id, count);
        }

        debug(
          '[hook][sub off] v%d %s/%s/%s -%s = %d \n%o',
          version,
          index,
          collection,
          room.id,
          connectionId,
          count,
          dbg
        );

        const synData = {
          index,
          collection,
          roomId: room.id,
          event: 'state',
          post: 'off'
        };

        this.node.broadcast('cluster:sync', synData);
      })
      .finally(() => this.node.state.locks.delete.delete(room.id));
  }

  /**
   * @param {Request} request
   */
  unlockCreateRoom (request) {
    this.node.state.locks.create.delete(request.input.body.roomId);
  }

  /**
   * @param {Request} request
   */
  unlockDeleteRoom (request) {
    this.node.state.locks.delete.delete(request.input.body.roomId);
  }

  resetSecurityCache () {
    this.node.broadcast('cluster:admin:resetSecurity');
  }

  dump (request) {
    if (!this.node.ready) {
      debug('[%s][warning] could not broadcast "dump" action: node not connected to cluster', this.uuid);
      return;
    }

    const suffix = request.input.args.suffix ? request.input.args.suffix : '';

    this.node.broadcast('cluster:admin:dump', { suffix });
  }

  shutdown () {
    if (!this.node.ready) {
      debug('[%s][warning] could not broadcast "shutdown" action: node not connected to cluster', this.uuid);
      return;
    }

    this.node.broadcast('cluster:admin:shutdown');
  }

  // --------------------------------------------------------------------------
  // controller actions
  // --------------------------------------------------------------------------
  clusterHealthAction () {
    if (!this.node.ready) {
      return Bluebird.reject(new this.context.errors.NotFoundError('ko'));
    }

    return Bluebird.resolve('ok');
  }

  clusterStatusAction () {
    if (!this.node.ready) {
      return Bluebird.reject(new this.context.errors.NotFoundError('ko'));
    }

    return Bluebird.resolve({
      count: 1 + Object.keys(this.node.pool).length,
      current: {
        pub: this.node.config.bindings.pub.href,
        router: this.node.config.bindings.router.href,
        ready: this.node.ready
      },
      pool: Object.keys(this.node.pool).map(k => {
        const node = this.node.pool[k];

        return {
          pub: node.pub,
          router: node.router,
          ready: node.ready
        };
      })
    });
  }

  clusterResetAction () {
    if (!this.node.ready) {
      return Bluebird.reject(new this.context.errors.NotFoundError('ko'));
    }

    return this.reset()
      .then(() => this.node.broadcast('cluster:sync', {event: 'state:reset'}))
      .then(() => 'ok');
  }

  // --------------------------------------------------------------------------
  // business
  // --------------------------------------------------------------------------
  /**
   * Removes cluster related data inserted in redis from nodeId
   *
   * @param {string} nodeId
   */
  cleanNode (node) {
    const
      promises = [];

    let deletedRooms = [];

    return this.redis.srem('cluster:discovery', JSON.stringify({
      pub: node.pub,
      router: node.router
    }))
      .then(() => {
        if (node === this.node && Object.keys(this.node.pool).length === 0) {
          debug('last node to quit.. cleaning up');
          return this.node.state.reset();
        }

        for (const index of Object.keys(this._rooms.tree)) {
          for (const collection of Object.keys(this._rooms.tree[index])) {
            promises.push(this.redis.clusterCleanNode(`{${index}/${collection}}`, node.uuid));
          }
        }

        return Bluebird.all(promises);
      })
      .then(responses => {
        if (!Array.isArray(responses)) {
          return;
        }

        for (const [, roomIds] of responses) {
          deletedRooms = deletedRooms.concat(roomIds);
        }

        if (deletedRooms.length) {
          return this.redis.srem('cluster:room_ids', deletedRooms);
        }
      })
      .then(() => this.node.broadcast('cluster:sync', {event: 'state:all'}));
  }

  deleteRoomCount (roomId) {
    if (!this._rooms.flat[roomId]) {
      return;
    }

    const
      {
        index,
        collection
      } = this._rooms.flat[roomId];

    delete this._rooms.flat[roomId];
    delete this._rooms.tree[index][collection][roomId];

    if (Object.keys(this._rooms.tree[index][collection]).length === 0) {
      delete this._rooms.tree[index][collection];

      if (Object.keys(this._rooms.tree[index]).length === 0) {
        delete this._rooms.tree[index];
      }
    }
  }

  log (level, msg) {
    if (this._isKuzzleStarted) {
      this.kuzzle.emit(`log:${level}`, msg);
    }
    else {
      // eslint-disable-next-line no-console
      console.log(`${new Date().toISOString()} [${level}] ${msg}`);
    }
  }

  reset () {
    return this.node.state.reset()
      .then(() => this.node.state.syncAll({post: 'reset'}))
      .then(() => {
        this._rooms = {
          flat: {},
          tree: {}
        };
      });
  }

  setRoomCount (index, collection, roomId, _count) {
    const count = parseInt(_count, 10);

    if (count === 0) {
      return this.deleteRoomCount(roomId);
    }

    const val = {
      index,
      collection,
      count
    };

    this._rooms.flat[roomId] = val;

    if (!this._rooms.tree[index]) {
      this._rooms.tree[index] = {};
    }
    if (!this._rooms.tree[index][collection]) {
      this._rooms.tree[index][collection] = {};
    }
    this._rooms.tree[index][collection][roomId] = count;
  }

  _onSubOn (type, index, collection, roomId, result) {
    const
      [version, count, dbg] = result;

    if (this.node.state.getVersion(index, collection) < version) {
      this.setRoomCount(index, collection, roomId, count);
    }

    debug('[hook][sub %s] v%d %s/%s/%s = %d\n%o',
      type,
      version,
      index,
      collection,
      roomId,
      count,
      dbg
    );

    const syncData = {
      index,
      collection,
      roomId,
      event: 'state',
      post: type
    };

    this.node.broadcast('cluster:sync', syncData);
  }

  _onShutDown (event) {
    if (this._shutdown) {
      return;
    }

    this._shutdown = true;
    this.log('warn', event + ' kuzzle is shutting down... doing our best to clean rooms');
    // eslint-disable-next-line no-console
    console.log(event, 'kuzzle is shutting down... doing our best to clean rooms');

    return this.cleanNode(this.node);
  }

  /**
   * @param {Request} request
   * @param {number} attempt
   * @private
   */
  _realtimeCountOverride (request, attempt = 0) {
    if (!request.input.body) {
      return Bluebird.reject(new this.context.errors.BadRequestError('The request must specify a body.'));
    }
    if (!request.input.body.hasOwnProperty('roomId')) {
      return Bluebird.reject(new this.context.errors.BadRequestError('The request must specify a body attribute "roomId".'));
    }

    const roomId = request.input.body.roomId;

    if (!this._rooms.flat[roomId]) {
      // no room found. May be normal but can also be due to cluster replication time
      if (attempt > 0) {
        return Bluebird.reject(new this.context.errors.NotFoundError(`The room Id "${roomId}" does not exist`));
      }

      return Bluebird
        .delay(this.config.timers.waitForMissingRooms)
        .then(() => this._realtimeCountOverride(request, attempt + 1));
    }

    return Bluebird.resolve({count: this._rooms.flat[roomId].count});
  }

  /**
   * @param {Request} request
   * @private
   */
  _realtimeListOverride (request) {
    const list = {};

    const promises = [];

    for (const roomId of Object.keys(this._rooms.flat)) {
      const room = this._rooms.flat[roomId];

      promises.push(request.context.user.isActionAllowed(new Request({
        controller: 'document',
        action: 'search',
        index: room.index,
        collection: room.collection
      }), this.kuzzle)
        .then(isAllowed => {
          if (!isAllowed) {
            return;
          }

          if (!list[room.index]) {
            list[room.index] = {};
          }
          if (!list[room.index][room.collection]) {
            list[room.index][room.collection] = {};
          }
          list[room.index][room.collection][roomId] = room.count;
        })
      );
    }

    return Bluebird.all(promises)
      .then(() => {
        if (!request.input.args.sorted) {
          return list;
        }

        const sorted = {};

        for (const index of Object.keys(list).sort()) {
          if (!sorted[index]) {
            sorted[index] = {};
          }

          for (const collection of Object.keys(list[index]).sort()) {
            if (!sorted[index][collection]) {
              sorted[index][collection] = {};
            }

            for (const roomId of Object.keys(list[index][collection]).sort()) {
              sorted[index][collection][roomId] = list[index][collection][roomId];
            }
          }
        }

        return sorted;
      });
  }

  _registerShutdownListeners () {
    for (const event of [
      'unhandledRejection',
      'uncaughtException',
      'SIGHUP',
      'SIGINT',
      'SIGQUIT',
      'SIGABRT',
      'SIGPIPE',
      'SIGTERM'
    ]) {
      process.on(event, () => this._onShutDown(event));
    }
  }

  /**
   *
   * @param {String} hostConfig The host representation as string, i.e. tcp://[eth0:ipv6]:9876
   * @param {integer} defaultPort Default port to use if none found from the config
   * @returns URL
   * @private
   */
  static _resolveBinding (hostConfig, defaultPort) {
    const parsed = url.parse(hostConfig, false, true);

    let host = parsed.hostname;

    if (/^\[.+\]/.test(parsed.host)) {
      const
        tmp = host.split(':'),
        family = tmp[1] || 'ipv4';

      if (tmp[0] === '_site_') {
        tmp[0] = 'public';
      }

      host = ip.address(tmp[0], family.toLowerCase());
    }

    return url.parse(`${parsed.protocol || 'tcp'}://${host}:${parsed.port || defaultPort}`);
  }

}

module.exports = KuzzleCluster;
