var 
  q = require('q'),
  rewire = require('rewire'),
  should = require('should'),
  sinon = require('sinon'),
  sandbox = sinon.sandbox.create(),
  KuzzleCluster = rewire('../../lib/index');

describe('lib/index', () => {
  var 
    pluginContext = {
      accessors: {kuzzle: {
        config: {},
        pluginsManager: {trigger: sandbox.spy()}
      }}
    },
    kuzzleCluster,
    MasterNode = sandbox.spy(),
    SlaveNode = sandbox.spy();
  
  KuzzleCluster.__set__({
    MasterNode,
    SlaveNode
  });
  
  beforeEach(() => {
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

      kuzzleCluster.init({some: 'value'}, context, true);
      
      should(kuzzleCluster.config).be.eql({
        some: 'value',
        foo: 'bar'
      });
    });
    
    it('should exit before creating the node when in dummy mode', () => {
      kuzzleCluster.init({}, pluginContext, true);
      
      should(kuzzleCluster.node).be.undefined();
    });
    
    it('should create a master node if requested', () => {
      kuzzleCluster.init({mode: 'master'}, pluginContext);
      
      should(MasterNode).be.calledOnce();
      should(MasterNode).be.calledWith(pluginContext, kuzzleCluster.config);
    });
    
    it('should create a slave node if requested', () => {
      kuzzleCluster.init({mode: 'slave'}, pluginContext);
      
      should(SlaveNode).be.calledOnce();
      should(SlaveNode).be.calledWith(pluginContext, kuzzleCluster.config);
    });
    
    it('should return itself', () => {
      should(kuzzleCluster.init({}, pluginContext)).be.exactly(kuzzleCluster);
    });
    
  });
  
  describe('#kuzzleStarted', () => {
    
    it('should call node::init', () => {
      kuzzleCluster.node = { init: sandbox.spy(() => q()) };
      
      return kuzzleCluster.kuzzleStarted()
        .then(() => {
          should(kuzzleCluster.node.init).be.calledOnce();
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
      
      kuzzleCluster.roomsRemoved({
        index: 'index', 
        collection: 'collection',
        data: {
          body: {
            rooms: 'rooms'
          }
        }
      });
      
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
        connection: 'connection',
        roomId: 'roomId'
      });
      should(kuzzleCluster.node.broker.broadcast).be.calledOnce();
      should(kuzzleCluster.node.broker.broadcast).be.calledWith('cluster:update', {
        hcDel: { c: 'connection', r: 'roomId'}
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
    
    it('should do nothing if the requestObject is invalid', () => {
      kuzzleCluster.node = {
        isReady: true,
        broker: {broadcast: sinon.spy()}
      };

      kuzzleCluster.autoRefreshUpdated({data: {body: {}}});
      kuzzleCluster.autoRefreshUpdated({data: {body: {autoRefresh: 'invalid'}}});
      kuzzleCluster.autoRefreshUpdated({data: {body: {autoRefresh: 42}}});
      
      should(kuzzleCluster.node.broker.broadcast).have.callCount(0);
    });
    
    it('should broadcast an ar diff', () => {
      kuzzleCluster.node = {
        isReady: true,
        broker: {broadcast: sinon.spy()}
      };

      kuzzleCluster.autoRefreshUpdated({index: 'index', data: {body: {autoRefresh: true}}});
      should(kuzzleCluster.node.broker.broadcast).be.calledOnce();
      should(kuzzleCluster.node.broker.broadcast).be.calledWithExactly('cluster:update', {
        ar: {i: 'index', v: true}
      });
    });
    
  });
  
});
