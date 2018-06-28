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
  KuzzleMock = require('../mocks/kuzzle.mock'),
  mockRequire = require('mock-require'),
  RedisMock = require('../mocks/redis.mock'),
  should = require('should'),
  sinon = require('sinon'),
  Request = require('kuzzle-common-objects').Request,
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
      uuid: 'uuid',
      cleanNode: sinon.stub().resolves(),
    };

    mockRequire('zmq', zmqMock);
    const Node = mockRequire.reRequire('../../lib/node');
    node = new Node(cluster);
  });

  afterEach(() => {
    clearInterval(node.heartbeatTimer);
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
      should(node.config).be.exactly(cluster.config);
      should(node.redis).be.exactly(cluster.redis);
      should(node.kuzzle).be.exactly(cluster.kuzzle);
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

      node.redis.smembers.resolves(['"foo"', '"bar"']);
      node.redis.scan.onFirstCall().resolves({newCursor: 1, keys: ['baz', 'zab']});
      node.redis.scan.onSecondCall().resolves({newCursor: 0, keys: ['qux']});

      return node.discover()
        .then(() => {
          should(node._addNode)
            .be.calledTwice()
            .be.calledWith('foo')
            .be.calledWith('bar');

          should(node.redis.del)
            .calledThrice()
            .calledWith('baz')
            .calledWith('zab')
            .calledWith('qux');

          should(node.redis.scan)
            .calledTwice()
            .calledWith(0, 'MATCH', 'cluster*', 'COUNT', 1000)
            .calledWith(1, 'MATCH', 'cluster*', 'COUNT', 1000);
        });
    });
  });

  describe('#init', () => {
    it('should inject the getState script in redis, register itself as a discoverable node, init heartbeat and join the cluster', () => {
      node.join = sinon.spy();

      return node.init()
        .then(() => {
          should(node.sockets.pub.bind)
            .be.calledOnce()
            .be.calledWith(cluster.config.bindings.pub.href);
          should(node.sockets.router.bind)
            .be.calledOnce()
            .be.calledWith(cluster.config.bindings.router.href);

          should(node.join)
            .be.calledOnce();
        });
    });
  });

  describe('#join', () => {
    beforeEach(() => {
      node.broadcast = sinon.stub().resolves();
      node.discover = sinon.stub().resolves();
      node._remoteSub = sinon.stub().resolves();
      node._syncState = sinon.stub().resolves();
      node.state.syncAll = sinon.stub().resolves();

      node.pool = {
        foo: {router: 'foo-router'},
        bar: {router: 'bar-router'}
      };
    });

    it('should do nothing if the cluster is ready', () => {
      node.ready = true;
      node.join();
      should(node.discover).have.callCount(0);
    });

    it('should run the sync sequence on discovered nodes', () => {
      return node.join()
        .then(() => {
          should(node._remoteSub)
            .be.calledTwice()
            .be.calledWith({router: 'foo-router'})
            .be.calledWith({router: 'bar-router'});

          should(node.state.syncAll).be.calledOnce();

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
    beforeEach(() => {
      sinon.stub(node, '_heartbeat');
    });

    it('should do nothing if the node is already registered', () => {
      node.pool.foo = true;
      node._addNode({pub: 'foo'});

      should(node.sockets.sub.connect)
        .have.callCount(0);
    });

    it('should register the node', () => {
      node._addNode({pub: 'foo'});

      should(node.sockets.sub.connect)
        .be.calledWith('foo');
      should(node._heartbeat)
        .be.calledWith({pub: 'foo'});
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
  });

  describe('#_onSubMessage', () => {
    it('cluster:heartbeat', () => {
      node._heartbeat = sinon.spy();
      node._onSubMessage(JSON.stringify(['cluster:heartbeat', 'data']));
      should(node._heartbeat)
        .be.calledWith('data');
    });

    it('cluster:notify:document', () => {
      const payload = {
        rooms: ['r1', 'r2', 'r3'],
        request: {
          data: {
            body: {foo: 'bar'},
            index: 'index',
            collection: 'collection'
          },
          options: {
            connectionId: 'connectionId'
          }
        },
        scope: 'scope',
        state: 'state',
        action: 'action',
        content: 'content'
      };

      node._onSubMessage(JSON.stringify(['cluster:notify:document', payload]));

      should(node.kuzzle.notifier._notifyDocument)
        .be.calledWithMatch(payload.rooms,
          sinon.match.instanceOf(Request),
          payload.scope,
          payload.state,
          payload.action,
          payload.content);

      const sentRequest = node.kuzzle.notifier._notifyDocument.firstCall.args[1];

      should(sentRequest.input.resource).match({
        index: payload.request.data.index,
        collection: payload.request.data.collection
      });

      should(sentRequest.input.body).match(payload.request.data.body);
      should(sentRequest.context.connectionId).match(payload.request.options.connectionId);
    });

    it('cluster:notify:user', () => {
      const payload = {
        room: 'room',
        request: {
          data: {
            body: {foo: 'bar'},
            index: 'index',
            collection: 'collection'
          },
          options: {
            connectionId: 'connectionId'
          }
        },
        scope: 'scope',
        content: 'content'
      };

      node._onSubMessage(JSON.stringify(['cluster:notify:user', payload]));

      should(node.kuzzle.notifier._notifyUser)
        .be.calledWithMatch(payload.room,
          sinon.match.instanceOf(Request),
          payload.scope,
          payload.content);

      const sentRequest = node.kuzzle.notifier._notifyUser.firstCall.args[1];

      should(sentRequest.input.resource).match({
        index: payload.request.data.index,
        collection: payload.request.data.collection
      });

      should(sentRequest.input.body).match(payload.request.data.body);
      should(sentRequest.context.connectionId).match(payload.request.options.connectionId);
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
      node._onSubMessage(JSON.stringify(['cluster:remove', {pub: 'data'}]));

      should(node._removeNode)
        .be.calledWith('data');
    });

    it('cluster:sync', () => {
      node.sync = sinon.spy();
      node._onSubMessage(JSON.stringify(['cluster:sync', 'data']));

      should(node.sync).be.calledWith('data');
    });

  });

  describe('#_remoteSub', () => {
    it('should ask remote node to subscribe to it', () => {
      node._remoteSub('endpoint');

      const socket = zmqMock.socket.lastCall.returnValue;
      const onMsg = socket.on.firstCall.args[1];

      should(socket.send)
        .be.calledWith(JSON.stringify(['remoteSub', node]));

      onMsg(JSON.stringify(['remoteSub', true]));
      should(socket.close)
        .be.calledOnce();
    });
  });

  describe('#_removeNode', () => {
    beforeEach(() => {
      node.state.syncAll = sinon.stub().resolves();
      sinon.stub(node, 'broadcast');
      sinon.stub(node, 'join');
    });

    it('should remove the given node', () => {
      node.pool = {
        foo: {
          pub: 'bar',
          heartbeat: null
        }
      };

      return node._removeNode('foo')
        .then(() => {
          should(node.sockets.sub.disconnect)
            .calledOnce()
            .calledWith('bar');
          should(node.pool).be.empty();
          should(node.broadcast).not.be.called();
          should(node.join).not.be.called();
        });
    });

    it('should kill itself is the corum is not reached', () => {
      node.config.minimumNodes = 2;
      node.pool = {
        foo: {
          pub: 'bar',
          heartbeat: null
        }
      };

      return node._removeNode('foo')
        .then(() => {
          should(node.pool).be.empty();
          should(node.ready).be.false();
          should(node.broadcast)
            .be.calledOnce()
            .be.calledWith('cluster:remove', node);
          should(node.join).be.calledOnce();
          should(node.sockets.sub.disconnect)
            .calledOnce()
            .calledWith('bar');
        });
    });
  });

  // The "sync" function works asynchronously without returning
  // async handler (promise or callback)
  // Welcome to setTimeout land!
  describe('#sync', () => {
    it('autorefresh', done => {
      const
        indexes = ['foo', 'bar', 'baz', 'qux'],
        hgetallPayload = {};

      for (const idx of indexes) {
        hgetallPayload[idx] = Math.random() > .5;
      }

      node.redis.hgetall.withArgs('cluster:autorefresh').resolves(hgetallPayload);

      node.sync({event: 'autorefresh'});

      setTimeout(() => {
        try {
          should(node.kuzzle.services.list.storageEngine.setAutoRefresh.callCount).eql(4);

          for (let i = 0; i < 4; i++) {
            const request = node.kuzzle.services.list.storageEngine.setAutoRefresh.getCall(i).args[0];

            should(request.serialize()).match({
              data: {
                index: indexes[i],
                controller: 'index',
                action: 'setAutoRefresh',
                body: {
                  autoRefresh: hgetallPayload[indexes[i]]
                }
              }
            });
          }

          done();
        } catch (e) {
          done(e);
        }
      }, 100);
    });

    it('indexCache:add', () => {
      node.sync({
        event: 'indexCache:add',
        index: 'index',
        collection: 'collection'
      });

      should(node.kuzzle.indexCache.add).be.calledWith('index', 'collection', false);
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
      node.sync({event: 'indexCache:reset'});

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

    it('state', () => {
      node.state.sync = sinon.spy();
      const data = {event: 'state'};

      node.sync(data);
      should(node.state.sync).be.calledWith(data);
    });

    it('state:all', () => {
      node.state.syncAll = sinon.spy();
      const data = {event: 'state:all'};

      node.sync(data);
      should(node.state.syncAll).be.calledWith(data);
    });

    it('state:reset', () => {
      node.context.reset = sinon.spy();
      const data = {event: 'state:reset'};

      node.sync(data);
      should(node.context.reset).be.calledOnce();
    });

    it('validators', () => {
      node.sync({event: 'validators'});
      should(node.kuzzle.validation.curateSpecification).be.calledOnce();
    });
  });
});
