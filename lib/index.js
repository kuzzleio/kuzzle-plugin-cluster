'use strict';

const
  debug = require('debug')('kuzzle:cluster'),
  fs = require('fs'),
  ip = require('ip'),
  {
    NotFoundError
  } = require('kuzzle-common-objects').errors,
  Node = require('./node'),
  path = require('path'),
  IORedis = require('ioredis'),
  url = require('url');

/**
 * @class KuzzleCluster
 * @property {object} config
 * @property {?Kuzzle} kuzzle
 * @property {?string} uuid
 * @property {Node} node
 * @property {object} hooks
 * @property {object[]} routes
 * @property {object} controllers
 * @property {?ProxyBroker} lbBroker
 */
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
      'core:notify:dispatch': 'notify',
      'core:hotelClerk:addSubscription': 'subscriptionAdded',
      'core:hotelClerk:removeRoomForCustomer': 'subscriptionOff',
      'core:hotelClerk:join': 'subscriptionJoined',
      'core:profileRepository:save': 'profileUpdated',
      'core:profileRepository:delete': 'profileUpdated',
      'core:roleRepository:save': 'roleUpdated',
      'core:roleRepository:delete': 'roleUpdated',
      'index:beforeSetAutoRefresh': 'autoRefreshUpdated',
      'collection:afterUpdateSpecifications': 'refreshSpecifications',
      'collection:afterDeleteSpecifications': 'refreshSpecifications',
      'room:new': 'roomBeingCreated'
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
      redis: {
        host: 'redis',
        port: 6379
      },
      retryJoin: 30,
      timers: {
        discoverTimeout: 3000,
        joinAttemptInterval: 2000,
        heartbeat: 5000
      }
    }, config || {});
    mergedConfig.bindings.pub = this._resolveBinding(mergedConfig.bindings.pub, 7511);
    mergedConfig.bindings.router = this._resolveBinding(mergedConfig.bindings.router, 7510);

    this.config = mergedConfig;

    // use pub endpoint as uuid
    this.uuid = this.config.bindings.pub.href;

    this.redis = new IORedis(this.config.redis);

    this.redis.defineCommand('clusterSubOn', {
      numberOfKeys: 4,
      lua: fs.readFileSync(path.resolve(__dirname, 'redis/subon.lua'))
    });
    this.redis.defineCommand('clusterSubOff', {
      numberOfKeys: 2,
      lua: fs.readFileSync(path.resolve(__dirname, 'redis/suboff.lua'))
    });
    this.redis.defineCommand('clusterReset', {
      numberOfKeys: 0,
      lua: fs.readFileSync(path.resolve(__dirname, 'redis/reset.lua'))
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

    if (request.input.body.autoRefresh === undefined) {
      return;
    }
    if (typeof request.input.body.autoRefresh !== 'boolean') {
      return;
    }

    return this.redis.hset('cluster:autorefresh', request.input.resource.index, request.input.body.autoRefresh)
      .then(() => this.node.broadcast('cluster:sync', {
        event: 'autorefresh',
        index: request.input.resource.index,
        value: request.input.body.autoRefresh
      }));
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

  /**
   * @param {object} diff
   */
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
    this.node.init();
  }

  notify (data) {
    if (!this.node.ready) {
      debug('[%s][warning] could not broadcast "profile update" action: node not connected to cluster', this.uuid);
      return;
    }

    this.node.broadcast('cluster:notify', data);
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

  strategyAdded (payload) {
    if (!this.node.ready) {
      debug('[%s][warning] could not broadcast "strategy added" action: node not connected to cluster', this.uuid);
      return;
    }

    this.node.broadcast('cluster:sync', Object.assign(payload, {
      event: 'strategy:added'
    }));
  }

  strategyRemoved (payload) {
    if (!this.node.ready) {
      debug('[%s][warning] could not broadcast "strategy added" action: node not connected to cluster', this.uuid);
      return;
    }

    this.node.broadcast('cluster:sync', Object.assign(payload, {
      event: 'strategy:removed'
    }));
  }

  /**
   *
   * @param {Object} diffs
   */
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
      serializedRoom = this._serializeRoom(this.kuzzle.hotelClerk.rooms[roomId]),
      serializedCustomer = JSON.stringify(this.kuzzle.hotelClerk.customers[connectionId]),
      serializedFilter = filter && JSON.stringify(filter) || 'none';

    return this.redis.clusterSubOn(
      index,
      collection,
      roomId,
      connectionId,
      serializedRoom,
      serializedCustomer,
      serializedFilter
    )
      .then(result => {
        debug('[hoook][sub added] %s/%s/%s + %s \n%o', index, collection, roomId, connectionId, result);

        delete this.node.pendingRooms.create[roomId];
        this.node.broadcast('cluster:sync', {
          index,
          collection,
          roomId,
          event: 'subscriptions',
          post: 'add'
        });
      });
  }

  /**
   * @param {Object} diff
   */
  subscriptionJoined (diff) {
    if (!this.node.ready) {
      debug('[%s][warning] could not broadcast "subscription joined" action: node not connected to cluster', this.uuid);
      return;
    }

    if (diff === false) {
      return;
    }

    const
      {
        index,
        collection,
        roomId,
        connectionId
      } = diff,
      serializedRoom = this._serializeRoom(this.kuzzle.hotelClerk.rooms[roomId]),
      serializedCustomer = JSON.stringify(this.kuzzle.hotelClerk.customers[connectionId]);

    return this.redis.clusterSubOn(
      index,
      collection,
      roomId,
      connectionId,
      serializedRoom,
      serializedCustomer,
      'none'
    )
      .then(result => {
        debug('[hook][sub joined] %s/%s/%s + %s \n%o', index, collection, roomId, connectionId, result);

        this.node.broadcast('cluster:sync', {
          index,
          collection,
          roomId,
          event: 'subscriptions',
          post: 'join'
        });
      });
  }

  /**
   * @param {{requestContext: RequestContext, roomId: string}} object
   */
  subscriptionOff (object) {
    if (!this.node.ready) {
      debug('[%s][warning] could not broadcast "subscription off" action: node not connected to cluster', this.uuid);
      return;
    }

    const
      roomId = object.roomId,
      room = this.kuzzle.hotelClerk.rooms[roomId],
      connectionId = object.requestContext.connectionId;

    this.node.pendingRooms.delete[roomId] = true;

    return this.redis.clusterSubOff(roomId, connectionId)
      .then(result => {
        debug(
          '[hook][sub off] %s/%s/%s -%s = %d \n%s',
          result[0], // index
          result[1], // collection
          roomId,
          connectionId,
          room ? room.customers.size : -1,
          result[2] // redis debug
        );

        delete this.node.pendingRooms.delete[roomId];
        this.node.broadcast('cluster:sync', {
          roomId,
          index: result[0],
          collection: result[1],
          event: 'subscriptions',
          post: 'off'
        });
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

  roomBeingCreated (data) {
    if (!this.node.ready) {
      return;
    }

    this.node.pendingRooms.create[data.roomId] = true;
  }

  // --------------------------------------------------------------------------
  // controller actions
  // --------------------------------------------------------------------------
  clusterHealthAction (request) {
    if (!this.node.ready) {
      request.setError(new NotFoundError('ko'));
      request.status = 404;
      return 'ko';
    }

    return 'ok';
  }

  clusterStatusAction (request) {
    if (!this.node.ready) {
      request.setError(new NotFoundError('ko'));
      request.status = 404;
      return 'ko';
    }

    const status = {
      count: 1 + Object.keys(this.node.pool).length,
      current: {
        pub: this.node.config.bindings.pub.href,
        router: this.node.config.bindings.router.href,
        ready: this.node.ready,
      },
      pool: Object.keys(this.node.pool).map(k => {
        const node = this.node.pool[k];

        return {
          pub: node.pub,
          router: node.router,
          ready: node.ready
        };
      })
    };

    return status;
  }

  clusterResetAction (request) {
    if (!this.node.ready) {
      request.setError(new NotFoundError('ko'));
      request.status = 404;
      return 'ko';
    }

    return this.redis.clusterReset()
      .then(() => this.node._syncState())
      .then(() => this.node.broadcast('cluster:sync', {event: 'subscriptions'}))
      .then(() => 'ok');
  }

  log (level, msg) {
    if (this.kuzzle.pluginsManager.isInit) {
      this.kuzzle.pluginsManager.trigger(`log:${level}`, msg);
    }
    else {
      console.log(`${new Date().toISOString()} [${level}] ${msg}`); // eslint-disable-line no-console
    }
  }

  /**
   * 
   * @param {String} hostConfig The host representation as string, i.e. tcp://[eth0:ipv6]:9876
   * @param {integer} defaultPort Default port to use if none found from the config
   * @returns URL
   * @private
   */
  _resolveBinding (hostConfig, defaultPort) {
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

    return url.parse(`${parsed.protocol || 'tcp'}//${host}:${parsed.port || defaultPort}`);
  }

  _serializeRoom (room) {
    return JSON.stringify({
      index: room.index,
      collection: room.collection,
      channels: room.channels,
      customers: [...room.customers]
    });
  }

}

module.exports = KuzzleCluster;


