const
  Bluebird = require('bluebird'),
  debug = require('debug')('kuzzle:cluster'),
  debugNotify = require('debug')('kuzzle:cluster:notify'),
  debugSync = require('debug')('kuzzle:cluster:sync'),
  fs = require('fs'),
  path = require('path'),
  {
    InternalError: KuzzleInternalError
  } = require('kuzzle-common-objects').errors,
  Request = require('kuzzle-common-objects').Request,
  zmq = require('zmq');


class Node {
  constructor (context) {
    this._context = context;

    this.uuid = null;
    this._pendingNodes = {};

    this.ready = false;

    this.sockets = {
      pub: zmq.socket('pub'),
      sub: zmq.socket('sub'),
      router: zmq.socket('router')
    };

    this.sockets.router.on('message', (envelope, binary) => this._onRouterMessage(envelope, binary));
    this.sockets.sub.on('message', binary => this._onSubMessage(binary));
    this.sockets.sub.subscribe('');

    // active node pool
    this.pool = {};

    // rooms being created
    this.pendingRooms = {
      create: {},
      delete: {}
    };
  }

  get config () {
    return this._context.config;
  }

  get redis () {
    return this._context.redis;
  }

  get kuzzle () {
    return this._context.kuzzle;
  }

  broadcast (room, data) {
    return this.sockets.pub.send(JSON.stringify([
      room,
      data
    ]));
  }

  discover () {
    return this.redis.smembers('cluster:discovery')
      .then(members => {
        for (const serialized of members) {
          this._addNode(JSON.parse(serialized));
        }
      });
  }

  init () {
    this.uuid = this._context.uuid;

    this.redis.defineCommand('clusterState', {
      numberOfKeys: 0,
      lua: fs.readFileSync(path.resolve(__dirname, 'redis/getState.lua'))
    });

    return this.redis.sadd('cluster:discovery', JSON.stringify(this))
      .then(() => Bluebird.all([
        Bluebird.promisify(this.sockets.pub.bind, {context: this.sockets.pub})(this.config.bindings.pub.href),
        Bluebird.promisify(this.sockets.router.bind, {context: this.sockets.router})(this.config.bindings.router.href)
      ]))
      .then(() => setInterval(() => this.broadcast('cluster:heartbeat', this.uuid), this.config.timers.heartbeat))
      .then(() => this.join());
  }

  join (attempts = 1) {
    if (this.ready) {
      debug('join - already in. skipping');
      return;
    }

    debug(`join - attempt: ${attempts}`);
    return this.discover()
      .then(() => {
        const promises = [];

        for (const k of Object.keys(this.pool)) {
          const node = this.pool[k];
          promises.push(this._remoteSub(node.router));
        }

        return Bluebird.all(promises);
      })
      .then(() => this._syncState())
      .then(() => {
        if (Object.keys(this.pool).length +1 >= this.config.minimumNodes) {
          debug('ready');
          this.ready = true;
          return this.broadcast('cluster:ready', this);
        }

        // did not join or corum not reached, retry
        if (attempts >= this.config.retryJoin) {
          return;
        }

        return Bluebird.delay(this.config.timers.joinAttemptInterval)
          .then(() => this.join(attempts + 1));
      });
  }

  toJSON () {
    return {
      pub: this.config.bindings.pub.href,
      router: this.config.bindings.router.href,
      ready: this.ready
    };
  }

  _addNode (node) {
    if (node.pub === this.uuid) {
      return;
    }

    if (this.pool[node.pub]) {
      return;
    }

    this.sockets.sub.connect(node.pub);
    this._heartbeat(node.pub);
    this.pool[node.pub] = node;
  }

  _heartbeat (nodePub) {
    const node = this.pool[nodePub];

    if (!node) {
      return;
    }

    clearTimeout(node.heartbeat);
    node.heartbeat = setTimeout(() => {
      this._context.log('warn', `[cluster] no heartbeat received in time for ${nodePub}. removing node`);
      this._removeNode(nodePub);
    }, this.config.timers.heartbeat * 2);
  }

  _onRouterMessage (envelope, buffer) {
    const
      [action, data] = JSON.parse(buffer);

    debug('[router][%s] %o', action, data);

    // called from a client to force current node to subscribe to it
    if (action === 'remoteSub') {
      if (!this.pool[data.pub]) {
        this._addNode(data);
      }

      this.sockets.router.send([
        envelope,
        JSON.stringify([
          'remoteSub',
          true
        ])
      ]);
    }
  }

  _onSubMessage (buffer) {
    const
      [room, data] = JSON.parse(buffer);

    if (['cluster:sync', 'cluster:notify'].indexOf(room) < 0) {
      // merges have their own debug level
      debug('[sub][%s] %o', room, data);
    }

    if (room === 'cluster:heartbeat') {
      this._heartbeat(data);
    }
    else if (room === 'cluster:notify') {
      debugNotify('%o', data);
      this.kuzzle.notifier._dispatch(data.channels, data.notification, data.connectionId, false);
    }
    else if (room === 'cluster:ready') {
      if (data.pub !== this.uuid && !this.pool[data.pub]) {
        // an unknown node is marked as ready, we are not anymore
        this._context.log('warn', `[cluster] unknown node ready: ${data.pub}`);

        this.ready = false;
        this._addNode(data);
        return Bluebird.delay(500)
          .then(() => this.join());
      }

      this.pool[data.pub].ready = true;
    }
    else if (room === 'cluster:remove') {
      this._removeNode(data);
    }
    else if (room === 'cluster:sync') {
      this._sync(data);
    }
  }

  _remoteSub (endpoint) {
    return new Bluebird(resolve => {
      const socket = zmq.socket('dealer');
      socket.connect(endpoint);
      socket.on('message', buffer => {
        const
          [action] = JSON.parse(buffer);

        if (action === 'remoteSub') {
          socket.close();
          resolve();
        }
      });

      socket.send(JSON.stringify([
        'remoteSub',
        this
      ]));

    });
  }

  _removeNode (nodePub) {
    debug(`[_removeNode] ${nodePub}`);
    const node = this.pool[nodePub];

    if (!node) {
      return;
    }

    clearTimeout(node.heartbeat);
    this.sockets.sub.disconnect(nodePub);
    delete this.pool[nodePub];

    if (Object.keys(this.pool).length + 1 < this.config.minimumNodes) {
      this._context.log('warn', '[cluster] not enough nodes to run. killing myself');
      this.ready = false;
      this.broadcast('cluster:remove', this.uuid);
      return this.join();
    }
  }

  _sync (data) {
    debugSync('%o', data);

    switch (data.event) {
      case 'autorefresh':
        this.kuzzle.services.list.storageEngine.setAutoRefresh(new Request({
          controller: 'index',
          action: 'setAutoRefresh',
          index: data.index,
          body: {autoRefresh: data.value}
        }));
        break;
      case 'indexCache:add':
        this.kuzzle.indexCache.add(data.index, data.collection, false);
        break;
      case 'indexCache:remove':
        this.kuzzle.indexCache.remove(data.index, data.collection, false);
        break;
      case 'indexCache:reset':
        this.kuzzle.indexCache.reset();
        break;
      case 'profile':
        delete this.kuzzle.repositories.profile.profiles[data.id];
        break;
      case 'role':
        delete this.kuzzle.repositories.role.roles[data.id];
        break;
      case 'strategy:added':
        if (this.kuzzle.pluginsManager.strategies[data.name]) {
          return debugSync('[strategy:add] %s already registered. Discarding', data.name);
        }
        this.kuzzle.pluginsManager.registerStrategy(data.pluginName, data.name, data.strategy);
        break;
      case 'strategy:removed':
        if (!this.kuzzle.pluginsManager.strategies[data.name]) {
          return debugSync('[strategy:remove] %s not found. Discarding', data.name);
        }
        this.kuzzle.pluginsManager.unregisterStrategy(data.pluginName, data.name);
        break;
      case 'subscriptions':
        this._syncState(data);
        break;
      case 'validators':
        this.kuzzle.validation.curateSpecification();
        break;
      default:
        throw new KuzzleInternalError(`Unknown sync event received: ${data.event}, ${JSON.stringify(data, undefined, 2)}`);
    }
  }

  /*
    state = {
      filters: {
        9b2a48ed71b5a17a: {
          index: 'i',
          collection: 'c',
          filters: [
            [ equals: {foo: 'bar'} ]
          ]
        }
      },
      hc: {
        customers: {
          705b8414-3c60-49bc-99b5-89aece4b7183: { 9b2a48ed71b5a17a: null },
          8eb84618-3d21-4043-815b-cd7988b0f000: { 9b2a48ed71b5a17a: null }
        },
        rooms: {
          9b2a48ed71b5a17a: {
            index: 'i',
            collection: 'c',
            channels: {
              9b2a48ed71b5a17a-7a90af8c8bdaac1b: {
                scope: 'all',
                state: 'done',
                users: 'none'
              }
            },
            customers: [
              '4bd1ed08-52c2-4458-9fcf-44b51c3e77f2'
            ]
          }
        }
      }
    }
   */
  _syncState (data) {
    const
      index = data && data.index,
      collection = data && data.collection;

    return this.redis.clusterState(index, collection)
      .then(serialized => {
        const state = JSON.parse(serialized);

        if (Array.isArray(state.debug)) {
          debugSync('%o', state.debug);
        }

        let currentRooms;
        {
          const
            storage = this.kuzzle.dsl.storage,
            source = index
              ? storage.filtersIndex[index] && storage.filtersIndex[index][collection] || []
              : Object.keys(this.kuzzle.hotelClerk.rooms);
          currentRooms = new Set(source);
        }

        for (const roomId of Object.keys(state.hc.rooms)) {
          const
            filter = state.filters[roomId],
            room = state.hc.rooms[roomId];

          currentRooms.delete(roomId);

          if (filter && !this.kuzzle.dsl.storage.filters[roomId]) {
            debugSync('registering filter %s/%s/%s', filter.index, filter.collection, roomId);
            this.kuzzle.dsl.storage.store(filter.index, filter.collection, filter.filters, roomId);
          }

          if (!this.pendingRooms.delete[roomId]) {
            this.kuzzle.hotelClerk.rooms[roomId] = {
              id: roomId,
              index: room.index,
              collection: room.collection,
              channels: room.channels,
              customers: new Set(room.customers)
            };
          }
        }

        for (const customerId of Object.keys(state.hc.customers)) {
          if (!this.kuzzle.hotelClerk.customers[customerId]) {
            this.kuzzle.hotelClerk.customers[customerId] = {};
          }
          Object.assign(this.kuzzle.hotelClerk.customers[customerId], state.hc.customers[customerId]);
        }

        // deleted rooms?
        for (const roomId of currentRooms) {
          const room = this.kuzzle.hotelClerk.rooms[roomId];

          if (room && !this.pendingRooms.create[roomId]) {
            debugSync('delete room %s/%s/%s', room.index, room.collection, roomId);
            this.kuzzle.hotelClerk._removeRoomEverywhere(roomId);
          }
        }

        for (const k of Object.keys(state.autorefresh)) {
          if (state.autorefresh[k] === 'true') {
            this.kuzzle.services.list.storageEngine.settings.autoRefresh[k] = true;
          }
          else {
            delete this.kuzzle.services.list.storageEngine.settings.autoRefresh[k];
          }
        }

      });
  }

}

module.exports = Node;
