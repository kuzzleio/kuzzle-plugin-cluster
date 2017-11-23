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
      redis: new RedisMock(),
      uuid: 'uuid',

      cleanNode: sinon.stub().returns(Bluebird.resolve()),
      deleteRoomCount: sinon.spy(),
      log: sinon.spy(),
      setRoomCount: sinon.spy(),
    };

    mockRequire('zeromq', zmqMock);
    mockRequire('ioredis', RedisMock);
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

      node.redis.scan.onFirstCall().returns(Bluebird.resolve(['cursor', ['k1', 'k2', 'k3']]));
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
    it('should register itself as a discoverable node, init heartbeat and join the cluster', () => {
      node.join = sinon.spy();

      return node.init()
        .then(() => {
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
      node.redis.clusterState.returns(Bluebird.resolve([
        '42',
        [
          ['r1', JSON.stringify({index: 'i1', collection: 'c1', filters: 'f1'}), 1],
          ['r2', JSON.stringify({index: 'i2', collection: 'c2', filters: 'f2'}), 2],
        ]
      ]));
      node.redis.smembers.returns(Bluebird.resolve(['k1', 'k2', 'k3']));

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
            .be.calledWith({router: 'foo-router'})
            .be.calledWith({router: 'bar-router'});

          should(node.broadcast)
            .be.calledOnce()
            .be.calledWith('cluster:ready', node);
        });
    });

    it('should keep retrying if the corum is not reached', () => {
      node.redis.clusterState.returns(Bluebird.resolve([
        '42',
        [
          ['r1', JSON.stringify({index: 'i1', collection: 'c1', filters: 'f1'}), 1],
          ['r2', JSON.stringify({index: 'i2', collection: 'c2', filters: 'f2'}), 2],
        ]
      ]));
      node.redis.smembers.returns(Bluebird.resolve(['k1', 'k2', 'k3']));

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
      node._addNode({pub: node.config.bindings.pub.href});

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
      const remoteNode = {pub: 'foo'};
      node._heartbeat = sinon.spy();

      node._addNode(remoteNode);

      should(node.sockets.sub.connect)
        .be.calledWith('foo');
      should(node._heartbeat)
        .be.calledWith(remoteNode);
      should(node.pool.foo)
        .eql(remoteNode);
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
  });

  describe('#_onSubMessage', () => {
    it('cluster:heartbeat', () => {
      node._heartbeat = sinon.spy();
      node._onSubMessage(JSON.stringify(['cluster:heartbeat', 'data']));
      should(node._heartbeat)
        .be.calledWith('data');
    });

    it('cluster:notify:document', () => {
      node._onSubMessage(JSON.stringify(['cluster:notify:document', {
        rooms: 'rooms',
        request: {
          data: {foo: 'bar'},
          options: {options: true},
        },
        scope: 'scope',
        state: 'state',
        action: 'action',
        content: 'content'
      }]));
      should(node.kuzzle.notifier._notifyDocument)
        .be.calledWithMatch(
          'rooms',
          {},
          'scope',
          'state',
          'action',
          'content'
        );
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
      node._onSubMessage(JSON.stringify(['cluster:remove', {pub: 'pub'}]));

      should(node._removeNode)
        .be.calledWith('pub');
    });

    it('cluster:sync', () => {
      node.sync = sinon.spy();
      node._onSubMessage(JSON.stringify(['cluster:sync', 'data']));

      should(node.sync)
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
          heartbeat: null,
          pub: 'foo'
        }
      };

      node._removeNode('foo');

      should(node.sockets.sub.disconnect)
        .be.calledWith('foo');
      should(node.pool)
        .be.empty();

    });

    it('should kill itself is the corum is not reached', () => {
      node.redis.clusterState.returns(Bluebird.resolve([
        '42',
        [
          ['r1', JSON.stringify({index: 'i1', collection: 'c1', filters: 'f1'}), 1],
          ['r2', JSON.stringify({index: 'i2', collection: 'c2', filters: 'f2'}), 2],
        ]
      ]));
      node.redis.smembers.returns(Bluebird.resolve(['k1', 'k2', 'k3']));
      node.config.minimumNodes = 2;
      node.pool = {
        foo: {
          heartbeat: null
        }
      };
      node.broadcast = sinon.spy();
      node.join = sinon.spy();

      return node._removeNode('foo')
        .then(() => {
          should(node.ready)
            .be.false();
          should(node.broadcast)
            .be.calledWith('cluster:remove', node);
          should(node.join)
            .be.calledOnce();
        });
    });
  });

  describe('#sync', () => {
    it('autorefresh', () => {
      node.redis.hgetall.returns(Bluebird.resolve({
        i1: true,
        i2: false
      }));

      return node.sync({
        event: 'autorefresh'
      })
        .then(() => {
          should(node.kuzzle.services.list.storageEngine.setAutoRefresh)
            .be.calledTwice();

          const req1 = node.kuzzle.services.list.storageEngine.setAutoRefresh.firstCall.args[0];
          const req2 = node.kuzzle.services.list.storageEngine.setAutoRefresh.secondCall.args[0];

          should(req1.input.resource.index).eql('i1');
          should(req1.input.body.autoRefresh).be.true();

          should(req2.input.resource.index).eql('i2');
          should(req2.input.body.autoRefresh).be.false();
        });
    });

    it('indexCache:add', () => {
      node.sync({
        event: 'indexCache:add',
        index: 'index',
        collection: 'collection'
      });

      should(node.kuzzle.indexCache.add)
        .be.calledWith('index', 'collection', false);
    });

    it('indexCache:remove', () => {
      node.sync({
        event: 'indexCache:remove',
        index: 'index',
        collection: 'collection'
      });
      should(node.kuzzle.indexCache.remove)
        .be.calledWith('index', 'collection', false);

    });

    it('indexCache:reset', () => {
      node.sync({
        event: 'indexCache:reset'
      });
      should(node.kuzzle.indexCache.reset)
        .be.calledOnce();
    });

    it('profile', () => {
      node.kuzzle.repositories.profile.profiles.foo = 'bar';
      node.sync({
        event: 'profile',
        id: 'foo'
      });
      should(node.kuzzle.repositories.profile.profiles)
        .be.empty();
    });

    it('role', () => {
      node.kuzzle.repositories.role.roles.foo = 'bar';
      node.sync({
        event: 'role',
        id: 'foo'
      });
      should(node.kuzzle.repositories.role.roles)
        .be.empty();
    });

    it('strategy:added', () => {
      node.sync({
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
      node.sync({
        event: 'strategy:removed',
        pluginName: 'pluginName',
        name: 'name'
      });
      should(node.kuzzle.pluginsManager.unregisterStrategy)
        .be.calledWith('pluginName', 'name');
    });

    it('subscriptions', () => {
      node.state.sync = sinon.spy();

      const data = {
        event: 'state',
        index: 'index',
        collection: 'collection'
      };
      node.sync(data);

      should(node.state.sync)
        .be.calledWith(data);
    });

    it('validators', () => {
      node.sync({
        event: 'validators'
      });
      should(node.kuzzle.validation.curateSpecification)
        .be.calledOnce();
    });
  });

  describe('#node.state.sync', () => {
    const rawState = [
      42,
      [
        [
          'room1',
          JSON.stringify({
            index: 'india',
            collection: 'coimbatore',
            filters: 'filters:room1'
          }),
          2
        ],
        [
          'room2',
          JSON.stringify({
            index: 'ireland',
            collection: 'cork',
            filters: 'filters:room2'
          }),
          5
        ],
        [
          'room3',
          JSON.stringify({
            index: 'india',
            collection: 'coimbatore',
            filters: 'filters:room3'
          }),
          2
        ],
        [
          'room4',
          JSON.stringify({
            index: 'india',
            collection: 'cuttak',
            filters: 'filters:room4'
          }),
          4
        ]
      ]
    ];

    beforeEach(() => {
      node.redis.clusterState.returns(Bluebird.resolve(rawState));
    });

    it('should get a complete snapshot', () => {
      return node.state.sync({
        index: 'index',
        collection: 'collection'
      })
        .then(() => {
          should(node.kuzzle.realtime.storage.store)
            .be.called();

          for (const room of rawState[1]) {
            const filter = JSON.parse(room[1]);
            should(node.kuzzle.realtime.storage.store)
              .be.calledWith(
                filter.index,
                filter.collection,
                filter.filters,
                room[0]
              );
          }
        });
    });

    it('should delete non-protected rooms', () => {
      node.kuzzle.realtime.storage.filtersIndex.index = {
        collection: [
          'todestroy',
          'anotherone'
        ]
      };

      return node.state.sync({index: 'index', collection: 'collection'})
        .then(() => {
          should(node.kuzzle.realtime.remove)
            .be.calledWith('todestroy')
            .be.calledWith('anotherone');
        });
    });

    it('should not delete a protected room (=being created)', () => {
      node.kuzzle.realtime.storage.filtersIndex.index = {
        collection: [
          'todestroy',
          'anotherone',
          'protected'
        ]
      };
      node.state.locks.create.add('protected');

      return node.state.sync({index: 'index', collection: 'collection'})
        .then(() => {
          should(node.kuzzle.realtime.remove)
            .be.calledWith('todestroy')
            .be.calledWith('anotherone');
          should(node.kuzzle.realtime.remove)
            .not.be.calledWith('protected');
        });
    });

  });
});


