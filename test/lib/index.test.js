const
  Bluebird = require('bluebird'),
  InternalError = require('kuzzle-common-objects').errors.InternalError,
  mock = require('mock-require'),
  should = require('should'),
  sinon = require('sinon'),
  Request = require('kuzzle-common-objects').Request,
  RequestContext = require('kuzzle-common-objects').models.RequestContext;

describe('lib/index', () => {
  let
    pluginContext,
    cluster,
    MNode,
    SNode;

  beforeEach(() => {
    MNode = sinon.spy(function MasterNode () {
      this.init = sinon.stub().returns(Bluebird.resolve({}));    // eslint-disable-line no-invalid-this
    });
    SNode = sinon.spy(function SlaveNode () {
      this.init = sinon.stub().returns(Bluebird.resolve({}));    // eslint-disable-line no-invalid-this
    });

    mock('../../lib/cluster/masterNode', MNode);
    mock('../../lib/cluster/slaveNode', SNode);
    mock('os', {
      networkInterfaces: () => {
        return {
          eth0: [{
            address: '1.2.3.4',
            netmask: '255.0.0.0',
            family: 'IPv4'
          }],
          lo: [{
            address: '127.0.0.1',
            netmask: '255.0.0.0',
            family: 'IPv4'
          }]
        };
      }
    });
    const KuzzleCluster = mock.reRequire('../../lib/index');

    pluginContext = {
      accessors: {
        kuzzle: {
          config: {
            services: {
              internalBroker: {
                port: 999
              }
            },
            cluster: {
              binding: '_host:666'
            }
          },
          pluginsManager: {trigger: sinon.spy(), isInit: true},
          services: {
            list: {
              proxyBroker: {
                handlers: {},
                listen: sinon.spy(),
                send: sinon.spy()
              }
            }
          }
        }
      }
    };
    cluster = new KuzzleCluster();
    cluster.init({}, pluginContext);
  });

  describe('#init', () => {
    it('should return itself', () => {
      should(cluster.init({}, pluginContext)).be.exactly(cluster);
    });

  });

  describe('#connectedToLB', () => {

    it('should use Kuzzle proxy broker to get the master/slave information', () => {
      cluster.init({}, pluginContext);
      cluster.connectedToLB();

      should(cluster.lbBroker).be.exactly(pluginContext.accessors.kuzzle.services.list.proxyBroker);
      should(cluster.lbBroker.listen).be.calledTwice();
      should(cluster.lbBroker.listen.firstCall).be.calledWith('cluster:' + cluster.uuid);
      should(cluster.lbBroker.listen.secondCall).be.calledWith('cluster:master');
      should(cluster.lbBroker.send).be.calledOnce();
      should(cluster.lbBroker.send).be.calledWith('cluster:join', {
        action: 'joined',
        uuid: cluster.uuid,
        host: cluster.config.binding.host,
        port: cluster.config.binding.port
      });
    });

  });

  describe('#indexCacheAdded', () => {

    it('should do nothing if not ready', () => {
      cluster.node = {
        isReady: false,
        broker: {broadcast: sinon.spy()}
      };

      cluster.indexCacheAdded(true);
      should(cluster.node.broker.broadcast).have.callCount(0);
    });

    it('should broadcast an icAdd diff', () => {
      cluster.node = {
        isReady: true,
        broker: {broadcast: sinon.spy()}
      };

      cluster.indexCacheAdded({index: 'index', collection: 'collection'});
      should(cluster.node.broker.broadcast).be.calledOnce();
      should(cluster.node.broker.broadcast).be.calledWith('cluster:update', [{
        icAdd: {i: 'index', c: 'collection'}
      }]);
    });

  });

  describe('#indexCacheRemoved', () => {

    it('should do nothing if not ready', () => {
      cluster.node = {
        isReady: false,
        broker: {broadcast: sinon.spy()}
      };

      cluster.indexCacheRemoved(true);
      should(cluster.node.broker.broadcast).have.callCount(0);
    });

    it('should broadcast an icDel diff', () => {
      cluster.node = {
        isReady: true,
        broker: {broadcast: sinon.spy()}
      };

      cluster.indexCacheRemoved({index: 'index', collection: 'collection'});
      should(cluster.node.broker.broadcast).be.calledOnce();
      should(cluster.node.broker.broadcast).be.calledWith('cluster:update', [{
        icDel: {i: 'index', c: 'collection'}
      }]);
    });

  });

  describe('#indexCacheReset', () => {

    it('should do nothing if not ready', () => {
      cluster.node = {
        isReady: false,
        broker: {broadcast: sinon.spy()}
      };

      cluster.indexCacheReset(true);
      should(cluster.node.broker.broadcast).have.callCount(0);
    });

    it('should broadcast an icReset diff', () => {
      cluster.node = {
        isReady: true,
        broker: {broadcast: sinon.spy()}
      };

      cluster.indexCacheReset({index: 'index'});
      should(cluster.node.broker.broadcast).be.calledOnce();
      should(cluster.node.broker.broadcast).be.calledWith('cluster:update', [{
        icReset: {i: 'index'}
      }]);
    });

  });

  describe('#subscriptionAdded', () => {

    it('should do nothing if not ready', () => {
      cluster.node = {
        isReady: false,
        broker: {broadcast: sinon.spy()}
      };

      cluster.subscriptionAdded({});
      should(cluster.node.broker.broadcast).have.callCount(0);
    });

    it('should broadcast the received diff', () => {
      const diff = {
        foo: 'bar'
      };

      cluster.node = {
        isReady: true,
        broker: {broadcast: sinon.spy()}
      };

      cluster.subscriptionAdded(diff);
      should(cluster.node.broker.broadcast).be.calledOnce();
      should(cluster.node.broker.broadcast).be.calledWith('cluster:update', diff);
    });

  });

  describe('#subscriptionJoined', () => {

    it('should do nothing if not ready', () => {
      cluster.node = {
        isReady: false,
        broker: {broadcast: sinon.spy()}
      };

      cluster.subscriptionJoined({});
      should(cluster.node.broker.broadcast).have.callCount(0);
    });

    it('should broadcast the received diff', () => {
      const diff = {
        foo: 'bar'
      };

      cluster.node = {
        isReady: true,
        broker: {broadcast: sinon.spy()}
      };

      cluster.subscriptionJoined(diff);
      should(cluster.node.broker.broadcast).be.calledOnce();
      should(cluster.node.broker.broadcast).be.calledWith('cluster:update', [diff]);
    });

  });

  describe('#subscriptionOff', () => {

    it('should do nothing if not ready', () => {
      cluster.node = {
        isReady: false,
        broker: {broadcast: sinon.spy()}
      };

      cluster.subscriptionOff({});
      should(cluster.node.broker.broadcast).have.callCount(0);
    });

    it('should broadcast an hcDel diff', () => {
      cluster.node = {
        isReady: true,
        broker: {broadcast: sinon.spy()}
      };

      cluster.subscriptionOff({
        requestContext: new RequestContext({connectionId: 'connection', protocol: 'foo'}),
        roomId: 'roomId'
      });
      should(cluster.node.broker.broadcast).be.calledOnce();
      should(cluster.node.broker.broadcast).be.calledWith('cluster:update', [{
        hcDel: { c: {i: 'connection', p: 'foo'}, r: 'roomId'}
      }]);
    });

  });

  describe('#autoRefreshUpdated', () => {

    it('should do nothing if not ready', () => {
      cluster.node = {
        isReady: false,
        broker: {broadcast: sinon.spy()}
      };

      cluster.autoRefreshUpdated();
      should(cluster.node.broker.broadcast).have.callCount(0);
    });

    it('should do nothing if the request is invalid', () => {
      cluster.node = {
        isReady: true,
        broker: {broadcast: sinon.spy()}
      };

      cluster.autoRefreshUpdated(new Request({body: {}}));
      cluster.autoRefreshUpdated(new Request({body: {autoRefresh: 'invalid'}}));
      cluster.autoRefreshUpdated(new Request({body: {autoRefresh: 42}}));

      should(cluster.node.broker.broadcast).have.callCount(0);
    });

    it('should broadcast an ar diff', () => {
      cluster.node = {
        isReady: true,
        broker: {broadcast: sinon.spy()}
      };

      cluster.autoRefreshUpdated(new Request({index: 'index', body: {autoRefresh: true}}));
      should(cluster.node.broker.broadcast).be.calledOnce();
      should(cluster.node.broker.broadcast).be.calledWith('cluster:update', [{
        ar: {i: 'index', v: true}
      }]);
    });

  });

  describe('#profileUpdated', () => {

    it('should do nothing if not ready', () => {
      cluster.node = {
        isReady: false,
        broker: {broadcast: sinon.spy()}
      };

      cluster.profileUpdated();
      should(cluster.node.broker.broadcast).have.callCount(0);
    });

    it('should broadcast a secPU diff', () => {
      cluster.node = {
        isReady: true,
        broker: {broadcast: sinon.spy()}
      };

      cluster.profileUpdated('diff');
      should(cluster.node.broker.broadcast).be.calledOnce();
      should(cluster.node.broker.broadcast).be.calledWith('cluster:update', [{
        secPU: 'diff'
      }]);
    });

  });

  describe('#roleUpdated', () => {

    it('should do nothing if not ready', () => {
      cluster.node = {
        isReady: false,
        broker: {broadcast: sinon.spy()}
      };

      cluster.roleUpdated();
      should(cluster.node.broker.broadcast).have.callCount(0);
    });

    it('should broadcast a srcRU diff', () => {
      cluster.node = {
        isReady: true,
        broker: {broadcast: sinon.spy()}
      };

      cluster.roleUpdated('diff');
      should(cluster.node.broker.broadcast).be.calledOnce();
      should(cluster.node.broker.broadcast).be.calledWith('cluster:update', [{
        secRU: 'diff'
      }]);
    });

  });

  describe('#refreshSpecifications', () => {

    it('should do nothing if not ready', () => {
      cluster.node = {
        isReady: false,
        broker: {broadcast: sinon.spy()}
      };

      cluster.refreshSpecifications();
      should(cluster.node.broker.broadcast).have.callCount(0);
    });

    it('should broadcast a vu diff', () => {
      cluster.node = {
        isReady: true,
        broker: {broadcast: sinon.spy()}
      };

      cluster.refreshSpecifications();
      should(cluster.node.broker.broadcast).be.calledOnce();
      should(cluster.node.broker.broadcast).be.calledWith('cluster:update', [{
        vu: {}
      }]);
    });
  });

  describe('#resolveBindings', () => {
    it('should do its job', () => {
      let response;

      should(cluster._resolveBinding('host')).be.eql({host: 'host', port: 999});
      should(cluster._resolveBinding('host:666')).be.eql({host: 'host', port: 666});

      response = cluster._resolveBinding('[lo:ipv4]');
      should(response.host).match(/^(\d+\.){3}\d+/);
      should(response.port).be.exactly(999);

      response = cluster._resolveBinding('[lo:ipv4]:666');
      should(response.host).match(/^(\d+\.){3}\d+/);
      should(response.port).be.exactly(666);

      should(() => cluster._resolveBinding('[invalidiface:ipv4]')).throw('Invalid network interface provided [invalidiface]');
      should(() => cluster._resolveBinding('[lo:invalid]')).throw('Invalid ip family provided [invalid] for network interface lo');
      should(() => cluster._resolveBinding('[lo.ipva]')).throw('Invalid binding pattern [lo.ipva]');
    });
  });

  describe('#onLbMessage', () => {
    beforeEach(() => {
      cluster._onJoinedLb = sinon.spy();
    });

    it('should call `onJoinedLb` on `joined` messages', () => {
      const msg = {action: 'joined', foo: 'bar'};

      cluster._onLbMessage(msg);
      should(cluster._onJoinedLb)
        .be.calledOnce()
        .be.calledWith(msg);
    });

    it('should throw if the msg type is unknown', () => {
      return should(() => cluster._onLbMessage({
        action: 'foo'
      }))
        .throw(InternalError);
    });
  });

  describe('#onJoinedLb', () => {

    beforeEach(() => {
      cluster.config = {
        retryInterval: 2222,
        initTimeout: 1000
      };
      cluster.uuid = 'uuid';
      cluster.lbBroker = {send: sinon.spy()};
    });

    it('should destroy the node if it exists', () => {
      const
        spy = sinon.spy();

      cluster.node = {detach: spy};

      return cluster._onJoinedLb({
        uuid: cluster.uuid
      })
        .then(() => {
          should(spy).be.calledOnce();
        });
    });

    it('should set a slave node if the master uuid is not itself', () => {
      return cluster._onJoinedLb({
        uuid: 'master-uuid',
        host: 'master-host',
        port: 'master-port'
      })
        .then(() => {
          should(cluster.kuzzle.pluginsManager.trigger)
            .be.calledTwice()
            .be.calledWith('log:info', '[cluster] ready')
            .be.calledWith('log:info', '[cluster] uuid joined as SlaveNode on master-host:master-port');
          should(cluster.isMasterNode).be.exactly(false);
        });
    });

    it('should set a master node if the master uuid is itself', () => {
      return cluster._onJoinedLb({
        uuid: cluster.uuid
      })
        .then(() => {
          should(cluster.kuzzle.pluginsManager.trigger)
            .be.calledTwice()
            .be.calledWith('log:info', '[cluster] ready')
            .be.calledWith('log:info', '[cluster] uuid joined as MasterNode on undefined:undefined');
          should(cluster.isMasterNode).be.exactly(true);
        });
    });

    it('should inform the broker if something went wrong with initing the node', () => {
      const
        processExit = sinon.stub(process, 'exit'),
        error = new Error('mine');

      mock('../../lib/cluster/masterNode', function () {
        // eslint-disable-next-line no-invalid-this
        this.init = sinon.stub().returns(Bluebird.reject(error));
      });
      const KuzzleCluster = mock.reRequire('../../lib/index');
      cluster = new KuzzleCluster();
      cluster.init({}, pluginContext);
      cluster.lbBroker = {send: sinon.spy()};

      return cluster._onJoinedLb({
        uuid: cluster.uuid
      })
        .then(() => {
          should(cluster.kuzzle.pluginsManager.trigger).be.calledOnce();
          should(cluster.kuzzle.pluginsManager.trigger).be.calledWith('log:error');
          should(cluster.lbBroker.send).be.calledOnce();
          should(cluster.lbBroker.send).be.calledWith('cluster:status', {
            status: 'error',
            code: 2,
            msg: 'Error while initiating cluster node',
            originalError: error
          });
          should(processExit).be.calledOnce();
          should(processExit).be.calledWith(1);
        });
    });

  });

});
