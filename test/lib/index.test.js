const
  Bluebird = require('bluebird'),
  mockRequire = require('mock-require'),
  KuzzleMock = require('../mocks/kuzzle.mock'),
  NodeMock = require('../mocks/node.mock'),
  RedisMock = require('../mocks/redis.mock'),
  Request = require('kuzzle-common-objects').Request,
  should = require('should'),
  sinon = require('sinon');

let
  Cluster;

describe('index', () => {
  let
    cluster,
    context;

  beforeEach(() => {
    mockRequire('ioredis', RedisMock);
    Cluster = mockRequire.reRequire('../../lib');
    cluster = new Cluster();
    cluster.node = new NodeMock(cluster);

    context = {
      accessors: {
        kuzzle: new KuzzleMock()
      },
      errors: {
        NotFoundError: Error
      }
    };
  });

  describe('#init', () => {
    it('should init the cluster with given config', () => {
      cluster.constructor._resolveBinding = sinon.stub().returnsArg(0);

      const response = cluster.init({
        foo: 'bar',
        redis: {
          something: 'else'
        }
      }, context);

      should(response)
        .be.exactly(cluster);

      should(cluster.context)
        .be.exactly(context);
      should(cluster.kuzzle)
        .be.exactly(context.accessors.kuzzle);
      should(cluster.config)
        .eql({
          foo: 'bar',
          bindings: {
            pub: 'tcp://[_site_:ipv4]:7511',
            router: 'tcp://[_site_:ipv4]:7510'
          },
          minimumNodes: 1,
          redis: {
            something: 'else'
          },
          retryJoin: 30,
          timers: {
            discoverTimeout: 3000,
            joinAttemptInterval: 2000,
            heartbeat: 5000,
            waitForMissingRooms: 4500
          }
        });

      should(cluster.redis)
        .be.an.instanceof(RedisMock);
      should(cluster.redis.defineCommand)
        .be.calledWith('clusterCleanNode')
        .be.calledWith('clusterState')
        .be.calledWith('clusterSubOn')
        .be.calledWith('clusterSubOff');
    });

  });

  describe('#hooks', () => {
    beforeEach(() => {
      cluster.init({}, context);
      cluster.node.ready = true;
    });

    it('most hooks should do nothing if the cluster node is not ready', () => {
      for (const event of Object.keys(cluster.hooks)) {
        const hook = cluster.hooks[event];

        if ([
          'kuzzleStarted',
          'roomBeingCreated',
          'roomCreated',
          'roomDeleted',
          'unlockCreateRoom',
          'unlockDeleteRoom'
        ].indexOf(hook) > -1) {
          continue;
        }

        const debug = sinon.spy();
        mockRequire('debug', () => debug);
        Cluster = mockRequire.reRequire('../../lib');
        cluster = new Cluster();
        cluster.node.ready = false;

        cluster[hook]();

        should(debug)
          .be.calledOnce()
          .be.calledWithMatch(/^\[.*?\]\[warning\] could not broadcast/);
      }
    });

    describe('#autorefreshUpdated', () => {
      it('should persist the autorefresh state in redis and broadcast the update', () => {
        return cluster.autoRefreshUpdated(new Request({
          controller: 'index',
          action: 'autorefresh',
          index: 'index',
          body: {
            autoRefresh: true
          }
        }))
          .then(() => {
            should(cluster.hooks['index:afterSetAutoRefresh'])
              .eql('autoRefreshUpdated');

            should(cluster.redis.hset)
              .be.calledWith('cluster:autorefresh', 'index', true);

            should(cluster.node.broadcast)
              .be.calledWith('cluster:sync', {
                event: 'autorefresh'
              });
          });
      });
    });

    describe('#indexCacheAdded', () => {
      it('should broadcast', () => {
        should(cluster.hooks['core:indexCache:add'])
          .eql('indexCacheAdded');

        cluster.indexCacheAdded({index: 'index', collection: 'collection'});

        should(cluster.node.broadcast)
          .be.calledWith('cluster:sync', {
            event: 'indexCache:add',
            index: 'index',
            collection: 'collection'
          });
      });
    });

    describe('#indexCacheRemoved', () => {
      it('should broadcast the change', () => {
        should(cluster.hooks['core:indexCache:remove'])
          .eql('indexCacheRemoved');

        cluster.indexCacheRemoved({index: 'index', collection: 'collection'});

        should(cluster.node.broadcast)
          .be.calledWith('cluster:sync', {
            event: 'indexCache:remove',
            index: 'index',
            collection: 'collection'
          });
      });
    });

    describe('#indexCacheReset', () => {
      it('should broadcast the change', () => {
        should(cluster.hooks['core:indexCache:reset'])
          .eql('indexCacheReset');

        cluster.indexCacheReset({index: 'index', collection: 'collection'});

        should(cluster.node.broadcast)
          .be.calledWith('cluster:sync', {
            event: 'indexCache:reset'
          });
      });

    });

    describe('#kuzzleStarted', () => {
      it('should init the cluster node', () => {
        should(cluster.hooks['core:kuzzleStart'])
          .eql('kuzzleStarted');

        cluster.kuzzleStarted();
        should(cluster.node.init)
          .be.calledOnce();
      });
    });

    describe('#notifyDocument', () => {
      it('should broadcast the notification', () => {
        should(cluster.hooks['core:notify:document'])
          .eql('notifyDocument');

        cluster.notifyDocument('notification');

        should(cluster.node.broadcast)
          .be.calledWith('cluster:notify:document', 'notification');
      });
    });

    describe('#notifyUser', () => {
      it('should broadcast the notification', () => {
        should(cluster.hooks['core:notify:user'])
          .eql('notifyUser');

        cluster.notifyUser('notification');

        should(cluster.node.broadcast)
          .be.calledWith('cluster:notify:user', 'notification');
      });
    });

    describe('#profileUpdated', () => {
      it('should broadcast change', () => {
        should(cluster.hooks['core:profileRepository:save'])
          .eql('profileUpdated');
        should(cluster.hooks['core:profileRepository:delete'])
          .eql('profileUpdated');

        cluster.profileUpdated({_id: 'id'});
        should(cluster.node.broadcast)
          .be.calledWith('cluster:sync', {
            event: 'profile',
            id: 'id'
          });
      });
    });

    describe('#roleUpdated', () => {
      it('should broadcast changes', () => {
        should(cluster.hooks['core:roleRepository:save'])
          .eql('roleUpdated');
        should(cluster.hooks['core:roleRepository:delete'])
          .eql('roleUpdated');

        cluster.roleUpdated({_id: 'id'});
        should(cluster.node.broadcast)
          .be.calledWith('cluster:sync', {
            event: 'role',
            id: 'id'
          });

      });
    });

    describe('#strategyAdded', () => {
      it('should broadcast changes', () => {
        should(cluster.hooks['core:auth:strategyAdded'])
          .eql('strategyAdded');

        cluster.strategyAdded({foo: 'bar'});
        should(cluster.node.broadcast)
          .be.calledWith('cluster:sync', {
            event: 'strategy:added',
            foo: 'bar'
          });
      });
    });

    describe('#strategyRemoved', () => {
      it('should broadcast changes', () => {
        should(cluster.hooks['core:auth:strategyRemoved'])
          .eql('strategyRemoved');

        cluster.strategyRemoved({foo: 'bar'});
        should(cluster.node.broadcast)
          .be.calledWith('cluster:sync', {
            event: 'strategy:removed',
            foo: 'bar'
          });
      });
    });

    describe('#subscriptionAdded', () => {
      it('should persist Kuzzle state in redis and broadcast a sync request', () => {
        should(cluster.hooks['core:hotelClerk:addSubscription'])
          .eql('subscriptionAdded');

        cluster.kuzzle.hotelClerk.rooms.roomId = 'room';
        cluster.kuzzle.hotelClerk.customers.connectionId = 'customer';
        cluster._serializeRoom = JSON.stringify;
        cluster.redis.clusterSubOn.returns(Bluebird.resolve(['version', 'count', 'dbg']));

        return cluster.subscriptionAdded({
          index: 'index',
          collection: 'collection',
          filters: 'filters',
          roomId: 'roomId',
          connectionId: 'connectionId'
        })
          .then(() => {
            should(cluster.redis.clusterSubOn)
              .be.calledWith('{index/collection}', cluster.uuid, 'roomId', 'connectionId', JSON.stringify({
                index: 'index',
                collection: 'collection',
                filters: 'filters'
              }));

            should(cluster.node.broadcast)
              .be.calledWith('cluster:sync', {
                index: 'index',
                collection: 'collection',
                roomId: 'roomId',
                event: 'state',
                post: 'add'
              });
          });
      });
    });

    describe('#subscriptionJoined', () => {
      it('should persist Kuzzle state in redis and broadcast changes', () => {
        should(cluster.hooks['core:hotelClerk:join'])
          .eql('subscriptionJoined');

        cluster.kuzzle.hotelClerk.rooms.roomId = {
          customers: new Set(['c1', 'c2'])
        };
        cluster.kuzzle.hotelClerk.customers.connectionId = 'customer';
        cluster._serializeRoom = JSON.stringify;
        cluster.redis.clusterSubOn.returns(Bluebird.resolve(['version', 'count', 'dbg']));

        return cluster.subscriptionJoined({
          index: 'index',
          collection: 'collection',
          roomId: 'roomId',
          connectionId: 'connectionId'
        })
          .then(() => {
            should(cluster.redis.clusterSubOn)
              .be.calledWith('{index/collection}', cluster.uuid, 'roomId', 'connectionId', 'none');

            should(cluster.node.broadcast)
              .be.calledWith('cluster:sync', {
                index: 'index',
                collection: 'collection',
                roomId: 'roomId',
                event: 'state',
                post: 'join'
              });
          });
      });
    });

    describe('#subscriptionOff', () => {
      it('should persist Kuzzle state in redis and broadcast changes', () => {
        should(cluster.hooks['core:hotelClerk:removeRoomForCustomer'])
          .eql('subscriptionOff');

        cluster.kuzzle.hotelClerk.rooms.roomId = { customers: {size: 2} };
        cluster.redis.clusterSubOff.returns(Bluebird.resolve(['index', 'collection', 'debug']));

        return cluster.subscriptionOff({
          room: {
            id: 'roomId',
            index: 'index',
            collection: 'collection'
          },
          requestContext: {
            connectionId: 'connectionId'
          }
        })
          .then(() => {
            should(cluster.redis.clusterSubOff)
              .be.calledWith('{index/collection}', cluster.uuid, 'roomId', 'connectionId');

            should(cluster.node.broadcast)
              .be.calledWith('cluster:sync', {
                roomId: 'roomId',
                index: 'index',
                collection: 'collection',
                event: 'state',
                post: 'off'
              });

          });
      });
    });

    describe('#refreshSpecifications', () => {
      it('should broadcast changes', () => {
        should(cluster.hooks['collection:afterDeleteSpecifications'])
          .eql('refreshSpecifications');
        should(cluster.hooks['collection:afterUpdateSpecifications'])
          .eql('refreshSpecifications');

        cluster.refreshSpecifications();

        should(cluster.node.broadcast)
          .be.calledWith('cluster:sync', {
            event: 'validators'
          });
      });

    });
  });

  describe('#controller', () => {
    beforeEach(() => {
      cluster.init({}, context);
      cluster.node.ready = true;
    });

    describe('#clusterHealthAction', () => {
      it('should be properly declared', () => {
        should(cluster.controllers.cluster.health)
          .eql('clusterHealthAction');
        should(cluster.routes)
          .containEql({verb: 'get', url: '/health', controller: 'cluster', action: 'health'});
      });

      it('should return a 404 if the cluster node is not ready', () => {
        cluster.node.ready = false;

        const request = new Request({});

        return cluster.clusterHealthAction(request)
          .then(() => {
            throw new Error('should not happen');
          })
          .catch(error => {
            should(error.message)
              .eql('ko');
          });
      });

      it('should return ok if the node is ready', () => {
        const request = new Request({});

        return cluster.clusterHealthAction(request)
          .then(response => {
            should(response)
              .eql('ok');
            should(request.status)
              .eql(102);
          });

      });
    });

    describe('#clusterStatusAction', () => {
      it('should be properly declared', () => {
        should(cluster.controllers.cluster.status)
          .eql('clusterStatusAction');
        should(cluster.routes)
          .containEql({verb: 'get', url: '/status', controller: 'cluster', action: 'status'});
      });

      it('should return a 404 if the cluster is not ready', () => {
        cluster.node.ready = false;

        const request = new Request({});
        return should(cluster.clusterStatusAction(request))
          .be.rejectedWith({message: 'ko'});
      });

      it('should return the cluster summary', () => {
        cluster.node.pool = {
          foo: {pub: 'foo-pub', router: 'foo-router', ready: true},
          bar: {pub: 'bar-pub', router: 'bar-router', ready: false}
        };
        cluster.config.bindings = {
          pub: {href: 'current-pub'},
          router: {href: 'current-router'},
          ready: true
        };

        const request = new Request({});

        return cluster.clusterStatusAction(request)
          .then(response => {
            should(response)
              .eql({
                count: 3,
                current: {
                  pub: 'current-pub',
                  router: 'current-router',
                  ready: true
                },
                pool: [
                  {
                    pub: 'foo-pub',
                    router: 'foo-router',
                    ready: true
                  },
                  {
                    pub: 'bar-pub',
                    router: 'bar-router',
                    ready: false
                  }
                ]
              });
          });
      });
    });

    describe('#clusterResetAction', () => {
      it('should be properly declared', () => {
        should(cluster.controllers.cluster.reset)
          .eql('clusterResetAction');
        should(cluster.routes)
          .containEql({verb: 'post', url: '/reset', controller: 'cluster', action: 'reset'});
      });

      it('should return a 404 if the cluster node is not ready', () => {
        cluster.node.ready = false;

        const request = new Request({});
        return should(cluster.clusterResetAction(request))
          .be.rejectedWith({message: 'ko'});
      });

      it('should reset redis state, sync its one and broadcast a sync request', () => {
        const request = new Request({});
        return cluster.clusterResetAction(request)
          .then(() => {
            should(cluster.node.broadcast)
              .be.calledWith('cluster:sync', {event: 'state:reset'});
          });
      });
    });
  });

});
