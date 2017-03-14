const
  rewire = require('rewire'),
  should = require('should'),
  sinon = require('sinon'),
  sandbox = sinon.sandbox.create(),
  KuzzleCluster = rewire('../../lib/index'),
  Request = require('kuzzle-common-objects').Request,
  RequestContext = require('kuzzle-common-objects').models.RequestContext;

describe('lib/index', () => {
  let
    pluginContext,
    kuzzleCluster,
    MasterNode = sandbox.spy(function MasterNode () {
      this.init = sandbox.stub().resolves({});    // eslint-disable-line no-invalid-this
    }),
    SlaveNode = sandbox.spy(function SlaveNode () {
      this.init = sandbox.stub().resolves({});    // eslint-disable-line no-invalid-this
    });

  KuzzleCluster.__set__({
    MasterNode,
    SlaveNode
  });

  beforeEach(() => {
    pluginContext = {
      accessors: {kuzzle: {
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
        pluginsManager: {trigger: sandbox.spy(), isInit: true},
        services: {list: {
          proxyBroker: {
            handlers: {},
            listen: sandbox.spy(),
            send: sandbox.spy()
          }
        }}
      }}
    };
    kuzzleCluster = new KuzzleCluster();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('#init', () => {

    it('should set internal properties', () => {
      const
        context = {
          accessors: {kuzzle: {config: {cluster:{ foo: 'bar'}}}}
        };

      KuzzleCluster.__with__({
        resolveBinding: sinon.stub().returns('newBinding')
      })(() => {
        kuzzleCluster.init({some: 'value', binding: 'binding'}, context, true);

        should(KuzzleCluster.__get__('resolveBinding')).be.calledOnce();
        should(KuzzleCluster.__get__('resolveBinding')).be.calledWith('binding');
      });

    });

    it('should return itself', () => {
      should(kuzzleCluster.init({}, pluginContext)).be.exactly(kuzzleCluster);
    });

  });

  describe('#connectedToLB', () => {

    it('should use Kuzzle proxy broker to get the master/slave information', () => {
      kuzzleCluster.init({}, pluginContext);
      kuzzleCluster.connectedToLB();

      should(kuzzleCluster.lbBroker).be.exactly(pluginContext.accessors.kuzzle.services.list.proxyBroker);
      should(kuzzleCluster.lbBroker.listen).be.calledTwice();
      should(kuzzleCluster.lbBroker.listen.firstCall).be.calledWith('cluster:' + kuzzleCluster.uuid);
      should(kuzzleCluster.lbBroker.listen.secondCall).be.calledWith('cluster:master');
      should(kuzzleCluster.lbBroker.send).be.calledOnce();
      should(kuzzleCluster.lbBroker.send).be.calledWith('cluster:join', {
        action: 'joined',
        uuid: kuzzleCluster.uuid,
        host: kuzzleCluster.config.binding.host,
        port: kuzzleCluster.config.binding.port
      });
    });

  });

  describe('#indexCacheAdded', () => {

    it('should do nothing if not ready', () => {
      kuzzleCluster.node = {
        isReady: false,
        broker: {broadcast: sinon.spy()}
      };

      kuzzleCluster.indexCacheAdded(true);
      should(kuzzleCluster.node.broker.broadcast).have.callCount(0);
    });

    it('should broadcast an icAdd diff', () => {
      kuzzleCluster.node = {
        isReady: true,
        broker: {broadcast: sinon.spy()}
      };

      kuzzleCluster.indexCacheAdded({index: 'index', collection: 'collection'});
      should(kuzzleCluster.node.broker.broadcast).be.calledOnce();
      should(kuzzleCluster.node.broker.broadcast).be.calledWith('cluster:update', [{
        icAdd: {i: 'index', c: 'collection'}
      }]);
    });

  });

  describe('#indexCacheRemoved', () => {

    it('should do nothing if not ready', () => {
      kuzzleCluster.node = {
        isReady: false,
        broker: {broadcast: sinon.spy()}
      };

      kuzzleCluster.indexCacheRemoved(true);
      should(kuzzleCluster.node.broker.broadcast).have.callCount(0);
    });

    it('should broadcast an icDel diff', () => {
      kuzzleCluster.node = {
        isReady: true,
        broker: {broadcast: sinon.spy()}
      };

      kuzzleCluster.indexCacheRemoved({index: 'index', collection: 'collection'});
      should(kuzzleCluster.node.broker.broadcast).be.calledOnce();
      should(kuzzleCluster.node.broker.broadcast).be.calledWith('cluster:update', [{
        icDel: {i: 'index', c: 'collection'}
      }]);
    });

  });

  describe('#indexCacheReset', () => {

    it('should do nothing if not ready', () => {
      kuzzleCluster.node = {
        isReady: false,
        broker: {broadcast: sinon.spy()}
      };

      kuzzleCluster.indexCacheReset(true);
      should(kuzzleCluster.node.broker.broadcast).have.callCount(0);
    });

    it('should broadcast an icReset diff', () => {
      kuzzleCluster.node = {
        isReady: true,
        broker: {broadcast: sinon.spy()}
      };

      kuzzleCluster.indexCacheReset({index: 'index'});
      should(kuzzleCluster.node.broker.broadcast).be.calledOnce();
      should(kuzzleCluster.node.broker.broadcast).be.calledWith('cluster:update', [{
        icReset: {i: 'index'}
      }]);
    });

  });

  describe('#subscriptionAdded', () => {

    it('should do nothing if not ready', () => {
      kuzzleCluster.node = {
        isReady: false,
        broker: {broadcast: sinon.spy()}
      };

      kuzzleCluster.subscriptionAdded({});
      should(kuzzleCluster.node.broker.broadcast).have.callCount(0);
    });

    it('should broadcast the received diff', () => {
      const diff = {
        foo: 'bar'
      };

      kuzzleCluster.node = {
        isReady: true,
        broker: {broadcast: sandbox.spy()}
      };

      kuzzleCluster.subscriptionAdded(diff);
      should(kuzzleCluster.node.broker.broadcast).be.calledOnce();
      should(kuzzleCluster.node.broker.broadcast).be.calledWith('cluster:update', diff);
    });

  });

  describe('#subscriptionJoined', () => {

    it('should do nothing if not ready', () => {
      kuzzleCluster.node = {
        isReady: false,
        broker: {broadcast: sinon.spy()}
      };

      kuzzleCluster.subscriptionJoined({});
      should(kuzzleCluster.node.broker.broadcast).have.callCount(0);
    });

    it('should broadcast the received diff', () => {
      const diff = {
        foo: 'bar'
      };

      kuzzleCluster.node = {
        isReady: true,
        broker: {broadcast: sandbox.spy()}
      };

      kuzzleCluster.subscriptionJoined(diff);
      should(kuzzleCluster.node.broker.broadcast).be.calledOnce();
      should(kuzzleCluster.node.broker.broadcast).be.calledWith('cluster:update', [diff]);
    });

  });

  describe('#subscriptionOff', () => {

    it('should do nothing if not ready', () => {
      kuzzleCluster.node = {
        isReady: false,
        broker: {broadcast: sinon.spy()}
      };

      kuzzleCluster.subscriptionOff({});
      should(kuzzleCluster.node.broker.broadcast).have.callCount(0);
    });

    it('should broadcast an hcDel diff', () => {
      kuzzleCluster.node = {
        isReady: true,
        broker: {broadcast: sandbox.spy()}
      };

      kuzzleCluster.subscriptionOff({
        requestContext: new RequestContext({connectionId: 'connection', protocol: 'foo'}),
        roomId: 'roomId'
      });
      should(kuzzleCluster.node.broker.broadcast).be.calledOnce();
      should(kuzzleCluster.node.broker.broadcast).be.calledWith('cluster:update', [{
        hcDel: { c: {i: 'connection', p: 'foo'}, r: 'roomId'}
      }]);
    });

  });

  describe('#autoRefreshUpdated', () => {

    it('should do nothing if not ready', () => {
      kuzzleCluster.node = {
        isReady: false,
        broker: {broadcast: sinon.spy()}
      };

      kuzzleCluster.autoRefreshUpdated(true);
      should(kuzzleCluster.node.broker.broadcast).have.callCount(0);
    });

    it('should do nothing if the request is invalid', () => {
      kuzzleCluster.node = {
        isReady: true,
        broker: {broadcast: sinon.spy()}
      };

      kuzzleCluster.autoRefreshUpdated(new Request({body: {}}));
      kuzzleCluster.autoRefreshUpdated(new Request({body: {autoRefresh: 'invalid'}}));
      kuzzleCluster.autoRefreshUpdated(new Request({body: {autoRefresh: 42}}));

      should(kuzzleCluster.node.broker.broadcast).have.callCount(0);
    });

    it('should broadcast an ar diff', () => {
      kuzzleCluster.node = {
        isReady: true,
        broker: {broadcast: sinon.spy()}
      };

      kuzzleCluster.autoRefreshUpdated(new Request({index: 'index', body: {autoRefresh: true}}));
      should(kuzzleCluster.node.broker.broadcast).be.calledOnce();
      should(kuzzleCluster.node.broker.broadcast).be.calledWith('cluster:update', [{
        ar: {i: 'index', v: true}
      }]);
    });

  });

  describe('#resolveBindings', () => {
    let
      resolveBinding = KuzzleCluster.__get__('resolveBinding'),
      revert;

    before(() => {
      revert = KuzzleCluster.__set__({
        _context: {
          accessors: {
            kuzzle: {config: {services:{internalBroker: {port: 999}}}}
          }
        }
      });
    });

    after(() => {
      revert();
    });

    it('should do its job', () => {
      let response;

      should(resolveBinding('host')).be.eql({host: 'host', port: 999});
      should(resolveBinding('host:666')).be.eql({host: 'host', port: 666});
      response = resolveBinding('[lo:ipv4]');
      should(response.host).match(/^(\d+\.){3}\d+/);
      should(response.port).be.exactly(999);

      response = resolveBinding('[lo:ipv4]:666');
      should(response.host).match(/^(\d+\.){3}\d+/);
      should(response.port).be.exactly(666);

      should(() => resolveBinding('[invalidiface:ipv4]')).throw('Invalid network interface provided [invalidiface]');
      should(() => resolveBinding('[lo:invalid]')).throw('Invalid ip family provided [invalid] for network interface lo');
    });

  });

  describe('#onLbMessage', () => {
    let
      onJoinedSpy = sandbox.spy(),
      onLbMessage,
      reset;

    beforeEach(() => {
      reset = KuzzleCluster.__set__({
        onJoinedLb: onJoinedSpy
      });
      onLbMessage = KuzzleCluster.__get__('onLbMessage');
      kuzzleCluster.kuzzle = pluginContext.accessors.kuzzle;
    });

    afterEach(() => {
      reset();
    });

    it('should call `onJoinedLb` on `joined` messages', () => {
      const msg = {action: 'joined', foo: 'bar'};

      onLbMessage.call(kuzzleCluster, msg);
      should(KuzzleCluster.__get__('onJoinedLb')).be.calledOnce();
      should(onJoinedSpy).be.calledOnce();
      should(onJoinedSpy).be.calledWithExactly(msg);
    });

    it('should log the ack response', () => {
      const msg = {action: 'ack', on: 'test'};

      kuzzleCluster.kuzzle = pluginContext.accessors.kuzzle;

      onLbMessage.call(kuzzleCluster, msg);
      should(kuzzleCluster.kuzzle.pluginsManager.trigger)
        .be.calledOnce()
        .be.calledWith('log:info',
          '[cluster] ACK for test event received from LB');
    });

  });

  describe('#onJoinedLb', () => {
    const
      onJoinedLb = KuzzleCluster.__get__('onJoinedLb');

    beforeEach(() => {
      kuzzleCluster.config = {
        retryInterval: 2222
      };
      kuzzleCluster.kuzzle = pluginContext.accessors.kuzzle;
      kuzzleCluster.uuid = 'uuid';
      kuzzleCluster.lbBroker = {send: sandbox.spy()};
    });

    it('should destroy the node if it exists', () => {
      const
        spy = sandbox.spy();

      kuzzleCluster.node = {detach: spy};

      return onJoinedLb.call(kuzzleCluster, {
        uuid: kuzzleCluster.uuid
      })
        .then(() => {
          should(spy).be.calledOnce();
        });
    });

    it('should set a slave node if the master uuid is not itself', () => {
      return onJoinedLb.call(kuzzleCluster, {
        uuid: 'master-uuid',
        host: 'master-host',
        port: 'master-port'
      })
        .then(() => {
          should(kuzzleCluster.kuzzle.pluginsManager.trigger)
            .be.calledTwice()
            .be.calledWith('log:info', '[cluster] ready')
            .be.calledWith('log:info', '[cluster] uuid joined as SlaveNode on master-host:master-port');
          should(kuzzleCluster.isMasterNode).be.exactly(false);
        });
    });

    it('should set a master node if the master uuid is itself', () => {
      return onJoinedLb.call(kuzzleCluster, {
        uuid: kuzzleCluster.uuid
      })
        .then(() => {
          should(kuzzleCluster.kuzzle.pluginsManager.trigger)
            .be.calledTwice()
            .be.calledWith('log:info', '[cluster] ready')
            .be.calledWith('log:info', '[cluster] uuid joined as MasterNode on undefined:undefined');
          should(kuzzleCluster.isMasterNode).be.exactly(true);
        });
    });

    it('should inform the broker if something went wrong with initing the node', () => {
      const
        error = new Error('mine'),
        reset = KuzzleCluster.__set__({
          MasterNode: function MasterNode () {          // eslint-disable-line no-shadow
            this.init = sandbox.stub().rejects(error);  // eslint-disable-line no-invalid-this
          }
        });

      return onJoinedLb.call(kuzzleCluster, {
        uuid: kuzzleCluster.uuid
      })
        .then(() => {
          should(kuzzleCluster.kuzzle.pluginsManager.trigger).be.calledOnce();
          should(kuzzleCluster.kuzzle.pluginsManager.trigger).be.calledWith('log:error');
          should(kuzzleCluster.lbBroker.send).be.calledOnce();
          should(kuzzleCluster.lbBroker.send).be.calledWith('cluster:status', {
            status: 'error',
            code: 2,
            msg: 'Error while initting the cluster node',
            originalError: error
          });
          reset();
        });
    });

  });

});
