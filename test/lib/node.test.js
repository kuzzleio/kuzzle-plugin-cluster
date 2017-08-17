const
  Bluebird = require('bluebird'),
  KuzzleMock = require('../mocks/kuzzle.mock'),
  mockRequire = require('mock-require'),
  RedisMock = require('../mocks/redis.mock'),
  should = require('should'),
  sinon = require('sinon'),
  zmqMock = require('../mocks/zmq.mock');

describe('node', () => {
  let
    cluster,
    node;

  beforeEach(() => {
    cluster = {
      config: {
        bindings: {
          pub: {href: 'pub-href'},
          router: {href: 'router-href'}
        },
        minimumNodes: 0,
        timers: {
          heartbeat: 20000
        }
      },
      kuzzle: new KuzzleMock(),
      log: sinon.spy(),
      redis: new RedisMock(),
      uuid: 'uuid'
    };

    mockRequire('zmq', zmqMock);
    const Node = mockRequire.reRequire('../../lib/node');
    node = new Node(cluster);
  });

  describe('#constructor', () => {
    it('should attach handlers to zmq sockets', () => {
      {
        node._onRouterMessage = sinon.spy();
        const routerHandler = node.sockets.router.on.firstCall.args[1];

        routerHandler('foo', 'bar');
        should(node._onRouterMessage)
          .be.calledOnce()
          .be.calledWith('foo', 'bar');
      }

      {
        node._onSubMessage = sinon.spy();
        const subHandler = node.sockets.sub.on.firstCall.args[1];

        subHandler('sub');
        should(node._onSubMessage)
          .be.calledOnce()
          .be.calledWith('sub');
        should(node.sockets.sub.subscribe)
          .be.calledOnce();
      }
    });
  });

  describe('#getters', () => {
    it('should return their context related property', () => {
      should(node.config)
        .be.exactly(cluster.config);
      should(node.redis)
        .be.exactly(cluster.redis);
      should(node.kuzzle)
        .be.exactly(cluster.kuzzle);
    });
  });

  describe('#broadcast', () => {
    it('should publish the message', () => {
      node.broadcast('room', 'message');

      should(node.sockets.pub.send)
        .be.calledOnce()
        .be.calledWith(JSON.stringify([
          'room',
          'message'
        ]));
    });
  });

  describe('#discover', () => {
    it('should add nodes retrieved from redis', () => {
      node._addNode = sinon.spy();

      node.redis.smembers = sinon.stub().returns(Bluebird.resolve(['"foo"', '"bar"']));

      return node.discover()
        .then(() => {
          should(node._addNode)
            .be.calledTwice()
            .be.calledWith('foo')
            .be.calledWith('bar');

        });
    });
  });

  describe('#init', () => {
    it('should inject the getState script in redis, register itself as a discoverable node, init heartbeat and join the cluster', () => {
      node.join = sinon.spy();

      return node.init()
        .then(() => {
          should(node.redis.defineCommand)
            .be.calledOnce()
            .be.calledWith('clusterState');

          should(node.redis.sadd)
            .be.calledWith('cluster:discovery');

          should(node.sockets.pub.bind)
            .be.calledOnce()
            .be.calledWith('pub-href');
          should(node.sockets.router.bind)
            .be.calledOnce()
            .be.calledWith('router-href');

          should(node.join)
            .be.calledOnce();
        });
    });
  });

  describe('#join', () => {
    beforeEach(() => {
      node.broadcast = sinon.stub().returns(Bluebird.resolve());
      node.discover = sinon.stub().returns(Bluebird.resolve());
      node._remoteSub = sinon.stub().returns(Bluebird.resolve());
      node._syncState = sinon.stub().returns(Bluebird.resolve());

      node.pool = {
        foo: {router: 'foo-router'},
        bar: {router: 'bar-router'}
      };
    });

    it('should do nothing if the cluster is ready', () => {
      node.ready = true;
      node.discover = sinon.spy();

      node.join();
      should(node.discover)
        .have.callCount(0);
    });

    it('should run the sync sequence on discovered nodes', () => {
      return node.join()
        .then(() => {
          should(node._remoteSub)
            .be.calledTwice()
            .be.calledWith('foo-router')
            .be.calledWith('bar-router');

          should(node._syncState)
            .be.calledOnce();

          should(node.broadcast)
            .be.calledOnce()
            .be.calledWith('cluster:ready', node);
        });
    });

    it('should keep retrying if the corum is not reached', () => {
      cluster.config.retryJoin = 3;
      cluster.config.minimumNodes = 9;

      return node.join()
        .then(() => {
          should(node.discover)
            .have.callCount(3);
        });
    });
  });

  describe('#_addNode', () => {
    it('should not add itself', () => {
      node._addNode({pub: node.uuid});

      should(node.sockets.sub.connect)
        .have.callCount(0);
    });

    it('should do nothing if the node is already registered', () => {
      node.pool.foo = true;
      node._addNode({pub: 'foo'});

      should(node.sockets.sub.connect)
        .have.callCount(0);
    });

    it('should register the node', () => {
      node._heartbeat = sinon.spy();

      node._addNode({pub: 'foo'});

      should(node.sockets.sub.connect)
        .be.calledWith('foo');
      should(node._heartbeat)
        .be.calledWith('foo');
      should(node.pool.foo)
        .eql({pub: 'foo'});
    });
  });

  describe('#_heartbeat', () => {


  });

  describe('#_onRouterMessage', () => {
    it('remoteSub', () => {
      node._addNode = sinon.spy();

      node._onRouterMessage('envelope', JSON.stringify(['remoteSub', { pub: 'pub'}]));

      should(node._addNode)
        .be.calledWith({pub: 'pub'});

      should(node.sockets.router.send)
        .be.calledWith(['envelope', JSON.stringify(['remoteSub', true])]);
    });

    it('ready', () => {
      node.broadcast = sinon.spy();
      node._addNode = sinon.spy();
      node._onRouterMessage('envelope', JSON.stringify(['ready', 'data']));

      should(node._addNode)
        .be.calledWith('data');
      should(node.broadcast)
        .be.calledWith('cluster:join', 'data');
    });

  });

  describe('#_onSubMessage', () => {
    it('cluster:heartbeat', () => {
      node._heartbeat = sinon.spy();
      node._onSubMessage(JSON.stringify(['cluster:heartbeat', 'data']));
      should(node._heartbeat)
        .be.calledWith('data');
    });

    it('cluster:notify', () => {
      node._onSubMessage(JSON.stringify(['cluster:notify', {
        channels: 'channels',
        notification: 'notification',
        connectionId: 'connectionId'
      }]));
      should(node.kuzzle.notifier._dispatch)
        .be.calledWith('channels', 'notification', 'connectionId', false);
    });

    it('cluster:ready', () => {
      node.pool.foo = {};
      node._onSubMessage(JSON.stringify(['cluster:ready', {
        pub: 'foo'
      }]));
      should(node.pool.foo.ready)
        .be.true();
    });

    it('cluster:ready unknown node', () => {
      node._addNode = sinon.spy();
      node.join = sinon.spy();

      return node._onSubMessage(JSON.stringify(['cluster:ready', {
        pub: 'foo'
      }]))
        .then(() => {
          should(node.ready)
            .be.false();
          should(node._addNode)
            .be.calledWith({pub: 'foo'});
          should(node.join)
            .be.calledOnce();
        });
    });

    it('cluster:remove', () => {
      node._removeNode = sinon.spy();
      node._onSubMessage(JSON.stringify(['cluster:remove', 'data']));

      should(node._removeNode)
        .be.calledWith('data');
    });

    it('cluster:sync', () => {
      node._sync = sinon.spy();
      node._onSubMessage(JSON.stringify(['cluster:sync', 'data']));

      should(node._sync)
        .be.calledWith('data');
    });

  });

  describe('#_remoteSub', () => {
    it('should ask remote node to subscribe to it', (done) => {
      node._remoteSub('endpoint');

      const socket = zmqMock.socket.lastCall.returnValue;
      const onMsg = socket.on.firstCall.args[1];

      should(socket.send)
        .be.calledWith(JSON.stringify(['remoteSub', node]));

      onMsg(JSON.stringify(['remoteSub', true]));
      should(socket.close)
        .be.calledOnce();

      done();
    });

  });

  describe('#_removeNode', () => {
    it('should remove the given node', () => {
      node.pool = {
        foo: {
          heartbeat: null
        }
      };

      node._removeNode('foo');

      should(node.sockets.sub.disconnect)
        .be.calledWith('foo');
      should(node.pool)
        .be.empty();

    });

    it('should kill itself is the corum is not reached', () => {
      node.config.minimumNodes = 2;
      node.pool = {
        foo: {
          heartbeat: null
        }
      };
      node.broadcast = sinon.spy();
      node.join = sinon.spy();

      node._removeNode('foo');

      should(node.ready)
        .be.false;
      should(node.broadcast)
        .be.calledWith('cluster:remove', node.uuid);
      should(node.join)
        .be.calledOnce();

    });
  });

  describe('#_sync', () => {
    it('autorefresh', () => {
      node._sync({
        event: 'autorefresh',
        index: 'index',
        value: 'value'
      });

      const request = node.kuzzle.services.list.storageEngine.setAutoRefresh.firstCall.args[0];
      should(request.serialize())
        .match({
          data: {
            controller: 'index',
            action: 'setAutoRefresh',
            body: {
              autoRefresh: 'value'
            }
          }
        });
    });

    it('indexCache:add', () => {
      node._sync({
        event: 'indexCache:add',
        index: 'index',
        collection: 'collection'
      });

      should(node.kuzzle.indexCache.add)
        .be.calledWith('index', 'collection', false);
    });

    it('indexCache:remove', () => {
      node._sync({
        event: 'indexCache:remove',
        index: 'index',
        collection: 'collection'
      });
      should(node.kuzzle.indexCache.remove)
        .be.calledWith('index', 'collection', false);

    });

    it('indexCache:reset', () => {
      node._sync({
        event: 'indexCache:reset'
      });
      should(node.kuzzle.indexCache.reset)
        .be.calledOnce();
    });

    it('profile', () => {
      node.kuzzle.repositories.profile.profiles.foo = 'bar';
      node._sync({
        event: 'profile',
        id: 'foo'
      });
      should(node.kuzzle.repositories.profile.profiles)
        .be.empty();
    });

    it('role', () => {
      node.kuzzle.repositories.role.roles.foo = 'bar';
      node._sync({
        event: 'role',
        id: 'foo'
      });
      should(node.kuzzle.repositories.role.roles)
        .be.empty();
    });

    it('strategy:added', () => {
      node._sync({
        event: 'strategy:added',
        id: 'foo',
        pluginName: 'plugin',
        name: 'bar',
        strategy: 'strategy'
      });
      should(node.kuzzle.pluginsManager.registerStrategy)
        .be.calledWith('plugin', 'bar', 'strategy');
    });

    it('strategy:removed', () => {
      node.kuzzle.pluginsManager.strategies.name = 'bar';
      node._sync({
        event: 'strategy:removed',
        pluginName: 'pluginName',
        name: 'name'
      });
      should(node.kuzzle.pluginsManager.unregisterStrategy)
        .be.calledWith('pluginName', 'name');
    });

    it('subscriptions', () => {
      node._syncState = sinon.spy();
      const data = {
        event: 'subscriptions',
        index: 'index',
        collection: 'collection'
      };
      node._sync(data);
      should(node._syncState)
        .be.calledWith(data)
    });

    it('validators', () => {
      node._sync({
        event: 'validators'
      });
      should(node.kuzzle.validation.curateSpecification)
        .be.calledOnce();
    });
  });

  describe('#_syncState', () => {
    const state = {
      autorefresh: {
        india: 'true',
        ireland: 'false'
      },
      filters: {
        room1: {
          index: 'india',
          collection: 'coimbatore',
          filters: 'filters:room1'
        },
        room2: {
          index: 'ireland',
          collection: 'cork',
          filters: 'filters:room2'
        },
        room3: {
          index: 'india',
          collection: 'coimbatore',
          filters: 'filters:room3'

        },
        room4: {
          index: 'india',
          collection: 'cuttak',
          filters: 'filters:room4'
        }
      },
      hc: {
        customers: {
          customer1: {room2: null},
          customer2: {room4: null}
        },
        rooms: {
          room1: {
            index: 'india',
            collection: 'coimbatore',
            channels: 'channels:room1',
            customers: [
              'customer2',
              'customer4'
            ]
          },
          room2: {
            index: 'ireland',
            collection: 'cork',
            channels: 'channels:room2',
            customers: [
              'customer1'
            ]
          },
          room3: {
            index: 'india',
            collection: 'coimbatore',
            channels: 'channels:room3',
            customers: [
              'customer3',
              'customer4'
            ]
          },
          room4: {
            index: 'india',
            collection: 'cuttak',
            channels: 'channels:room4',
            customers: [
              'customer4'
            ]
          }
        }
      }
    };

    beforeEach(() => {
      node.redis.clusterState.returns(Bluebird.resolve(JSON.stringify(state)));
    });

    it('should get a complete snapshot', () => {
      return node._syncState()
        .then(() => {
          for (const roomId of ['room1', 'room2', 'room3', 'room4']) {
            should(node.kuzzle.hotelClerk.rooms[roomId])
              .match({
                id: roomId,
                index: state.hc.rooms[roomId].index,
                collection: state.hc.rooms[roomId].collection,
                channels: state.hc.rooms[roomId].channels,
                customers: new Set(state.hc.rooms[roomId].customers)
              });

            should(node.kuzzle.dsl.storage.store)
              .be.calledWith(state.filters[roomId].index, state.filters[roomId].collection, state.filters[roomId].filters, roomId);
          }

          should(node.kuzzle.services.list.storageEngine.settings.autoRefresh.india)
            .be.true();
          should(node.kuzzle.services.list.storageEngine.settings.autoRefresh.ireland)
            .be.undefined();
        });
    });

    it('should delete non-protected rooms', () => {
      node.kuzzle.hotelClerk.rooms.toDestroy1 = 'a room';
      node.kuzzle.hotelClerk.rooms.toDestroy2 = 'another one';

      return node._syncState()
        .then(() => {
          should(node.kuzzle.hotelClerk._removeRoomEverywhere)
            .be.calledWith('toDestroy1')
            .be.calledWith('toDestroy2');
        });
    });

    it('should delete non-protected rooms when syncing a collection', () => {
      node.kuzzle.hotelClerk.rooms.toDestroy1 = 'a room';
      node.kuzzle.hotelClerk.rooms.toDestroy2 = 'another one';
      node.kuzzle.dsl.storage.filtersIndex.index = {collection: ['toDestroy1', 'toDestroy2']};

      return node._syncState({index: 'index', collection: 'collection'})
        .then(() => {
          should(node.kuzzle.hotelClerk._removeRoomEverywhere)
            .be.calledWith('toDestroy1')
            .be.calledWith('toDestroy2');
        });
    });

    it('should not delete a protected room (=being created)', () => {
      node.kuzzle.hotelClerk.rooms.toDestroy1 = 'a room';
      node.kuzzle.hotelClerk.rooms.toDestroy2 = 'another one';
      node.kuzzle.dsl.storage.filtersIndex.index = {collection: ['toDestroy1', 'toDestroy2']};
      node.pendingRooms.create.toDestroy2 = true;

      return node._syncState({index: 'index', collection: 'collection'})
        .then(() => {
          should(node.kuzzle.hotelClerk._removeRoomEverywhere)
            .be.calledWith('toDestroy1')
            .not.be.calledWith('toDestroy2');
        });

    });

  });
});


