var
  rewire = require('rewire'),
  should = require('should'),
  sinon = require('sinon'),
  sandbox = sinon.sandbox.create(),
  KuzzleCluster = rewire('../../lib/index'),
  Request = require('kuzzle-common-objects').Request,
  RequestContext = require('kuzzle-common-objects').models.RequestContext;

describe('lib/index', () => {
  var
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
        pluginsManager: {trigger: sandbox.spy()},
        services: {list: {
          proxyBroker: {
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

    it('should extend its config with Kuzzle cluster one', () => {
      var
        context = {
          accessors: {kuzzle: {config: {cluster:{ foo: 'bar'}}}}
        };

      KuzzleCluster.__with__({
        resolveBinding: sinon.stub().returns('newBinding')
      })(() => {
        kuzzleCluster.init({some: 'value', binding: 'binding'}, context, true);

        should(kuzzleCluster.config).be.eql({
          binding: 'newBinding',
          some: 'value',
          foo: 'bar'
        });

        should(KuzzleCluster.__get__('resolveBinding')).be.calledOnce();
        should(KuzzleCluster.__get__('resolveBinding')).be.calledWith('binding');
      });

    });

    it('should return itself', () => {
      should(kuzzleCluster.init({}, pluginContext)).be.exactly(kuzzleCluster);
    });

  });

  describe('#kuzzleStarted', () => {

    it('should use Kuzzle proxy broker to get the master/slave information', () => {
      kuzzleCluster.init({}, pluginContext);
      kuzzleCluster.kuzzleStarted();

      should(kuzzleCluster.lbBroker).be.exactly(pluginContext.accessors.kuzzle.services.list.proxyBroker);
      should(kuzzleCluster.lbBroker.listen).be.calledTwice();
      should(kuzzleCluster.lbBroker.listen.firstCall).be.calledWith('cluster:' + kuzzleCluster.uuid);
      should(kuzzleCluster.lbBroker.listen.secondCall).be.calledWith('cluster:master');
      should(kuzzleCluster.lbBroker.send).be.calledOnce();
      should(kuzzleCluster.lbBroker.send).be.calledWith('cluster:join', {
        action: 'joined',
        uuid: kuzzleCluster.uuid,
        host: '_host',
        port: 666
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
      should(kuzzleCluster.node.broker.broadcast).be.calledWithExactly('cluster:update', {
        icAdd: {i: 'index', c: 'collection'}
      });
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
      should(kuzzleCluster.node.broker.broadcast).be.calledWithExactly('cluster:update', {
        icDel: {i: 'index', c: 'collection'}
      });
    });

  });

  describe('#indexCacheResett', () => {

    it('should do nothing if not ready', () => {
      kuzzleCluster.node = {
        isReady: false,
        broker: {broadcast: sinon.spy()}
      };

      kuzzleCluster.indexCacheResett(true);
      should(kuzzleCluster.node.broker.broadcast).have.callCount(0);
    });

    it('should broadcast an icReset diff', () => {
      kuzzleCluster.node = {
        isReady: true,
        broker: {broadcast: sinon.spy()}
      };

      kuzzleCluster.indexCacheResett({index: 'index'});
      should(kuzzleCluster.node.broker.broadcast).be.calledOnce();
      should(kuzzleCluster.node.broker.broadcast).be.calledWithExactly('cluster:update', {
        icReset: {i: 'index'}
      });
    });

  });

  describe('#roomsRemoved', () => {

    it('should do nothing if not ready', () => {
      kuzzleCluster.node = {
        isReady: false,
        broker: {broadcast: sinon.spy()}
      };

      kuzzleCluster.roomsRemoved({});
      should(kuzzleCluster.node.broker.broadcast).have.callCount(0);
    });

    it('should broadcast a multi del diff', () => {
      kuzzleCluster.node = {
        isReady: true,
        broker: {broadcast: sinon.spy()}
      };

      kuzzleCluster.roomsRemoved(new Request({
        index: 'index',
        collection: 'collection',
        body: {rooms: 'rooms'}
      }));

      should(kuzzleCluster.node.broker.broadcast).be.calledOnce();
      should(kuzzleCluster.node.broker.broadcast).be.calledWith('cluster:update', {
        hcDelMul: {
          i: 'index',
          c: 'collection',
          r: 'rooms'
        }
      });
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
      var diff = {
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
      var diff = {
        foo: 'bar'
      };

      kuzzleCluster.node = {
        isReady: true,
        broker: {broadcast: sandbox.spy()}
      };

      kuzzleCluster.subscriptionJoined(diff);
      should(kuzzleCluster.node.broker.broadcast).be.calledOnce();
      should(kuzzleCluster.node.broker.broadcast).be.calledWith('cluster:update', diff);
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
      should(kuzzleCluster.node.broker.broadcast).be.calledWith('cluster:update', {
        hcDel: { c: {i: 'connection', p: 'foo'}, r: 'roomId'}
      });
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
      should(kuzzleCluster.node.broker.broadcast).be.calledWithExactly('cluster:update', {
        ar: {i: 'index', v: true}
      });
    });

  });

  describe('#resolveBindings', () => {
    var
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
      var response;

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
    var
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
      var msg = {action: 'joined', foo: 'bar'};

      onLbMessage.call(kuzzleCluster, msg);
      should(KuzzleCluster.__get__('onJoinedLb')).be.calledOnce();
      should(onJoinedSpy).be.calledOnce();
      should(onJoinedSpy).be.calledWithExactly(msg);
    });

    it('should log the ack response', () => {
      var msg = {action: 'ack', on: 'test'};

      kuzzleCluster.kuzzle = pluginContext.accessors.kuzzle;

      onLbMessage.call(kuzzleCluster, msg);
      should(kuzzleCluster.kuzzle.pluginsManager.trigger).be.calledTwice();
      should(kuzzleCluster.kuzzle.pluginsManager.trigger.firstCall).be.calledWith('log:debug',
        '[cluster] onLbMessage: {"action":"ack","on":"test"}');
      should(kuzzleCluster.kuzzle.pluginsManager.trigger.secondCall).be.calledWith('log:info',
        '[cluster] ACK for test event received from LB');
    });

  });

  describe('#onJoinedLb', () => {
    var
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
      var
        spy = sandbox.spy();

      kuzzleCluster.node = {destroy: spy};

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
          should(kuzzleCluster.kuzzle.pluginsManager.trigger).be.calledTwice();
          should(kuzzleCluster.kuzzle.pluginsManager.trigger.firstCall).be.calledWith('log:info', '[cluster] Notification: Kuzzle is ready');
          should(kuzzleCluster.kuzzle.pluginsManager.trigger.secondCall).be.calledWith('log:info', '[cluster] uuid joined as SlaveNode on master-host:master-port');
          should(kuzzleCluster.isMasterNode).be.exactly(false);
        });
    });

    it('should set a master node if the master uuid is itself', () => {
      return onJoinedLb.call(kuzzleCluster, {
        uuid: kuzzleCluster.uuid
      })
        .then(() => {
          should(kuzzleCluster.kuzzle.pluginsManager.trigger).be.calledTwice();
          should(kuzzleCluster.kuzzle.pluginsManager.trigger.firstCall).be.calledWith('log:info', '[cluster] Notification: Kuzzle is ready');
          should(kuzzleCluster.kuzzle.pluginsManager.trigger.secondCall).be.calledWith('log:info', '[cluster] uuid joined as MasterNode on undefined:undefined');
          should(kuzzleCluster.isMasterNode).be.exactly(true);
        });
    });

    it('should inform the broker if something went wrong with initing the node', () => {
      var
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
