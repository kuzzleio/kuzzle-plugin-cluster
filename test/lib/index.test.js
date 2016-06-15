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
      kuzzle: {
        config: {}
      }
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
          kuzzle: {
            config: {
              cluster: {
                foo: 'bar'
              }
            }
          }
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
          should(kuzzleCluster.isReady).be.true();
        });
    });

  });

  describe('#roomsRemoved', () => {

    it('should do nothing if not ready', () => {
      kuzzleCluster.node = {broker: {broadcast: sinon.spy()}};
      kuzzleCluster.isReady = false;
      
      kuzzleCluster.roomsRemoved({});
      should(kuzzleCluster.node.broker.broadcast).have.callCount(0);
    });

    it('should broadcast a multi del diff', () => {
      kuzzleCluster.node = {broker: {broadcast: sinon.spy()}};
      kuzzleCluster.isReady = true;
      
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
  
  describe('#indexCreated', () => {
    
    it('should do nothing if the node is not ready', () => {
      kuzzleCluster.node = {broker: {broadcast: sinon.spy()}};
      kuzzleCluster.isReady = false;
      
      kuzzleCluster.indexCreated({});
      should(kuzzleCluster.node.broker.broadcast).have.callCount(0);
    });
    
    it('should do nothing if no index is defined', () => {
      kuzzleCluster.node = {broker: {broadcast: sinon.spy()}};
      kuzzleCluster.isReady = true;
      
      kuzzleCluster.indexCreated({});
      should(kuzzleCluster.node.broker.broadcast).have.callCount(0);
    });
    
    it('should broadcast a ic diff', () => {
      kuzzleCluster.node = {broker: {broadcast: sinon.spy()}};
      kuzzleCluster.isReady = true;
      
      kuzzleCluster.indexCreated({
        index: 'index',
        collection: 'collection',
        result: { acknowledged: true }
      });
      should(kuzzleCluster.node.broker.broadcast).be.calledOnce();
      should(kuzzleCluster.node.broker.broadcast).be.calledWith('cluster:update', {
        ic: { '+': [{i: 'index'}]}
      });
    });
  });
  
  describe('#indexDeleted', () => {
   
    it('should do nothing is not ready', () => {
      kuzzleCluster.node = {broker: {broadcast: sinon.spy()}};
      kuzzleCluster.isReady = false;
      
      kuzzleCluster.indexDeleted({});
      should(kuzzleCluster.node.broker.broadcast).have.callCount(0);
    });
    
    it('should do nothgin if no index is given', () => {
      kuzzleCluster.node = {broker: {broadcast: sinon.spy()}};
      kuzzleCluster.isReady = true;

      kuzzleCluster.indexDeleted({});
      should(kuzzleCluster.node.broker.broadcast).have.callCount(0);
    });
    
    it('should broadcast an ic diff', () => {
      kuzzleCluster.node = {broker: {broadcast: sinon.spy()}};
      kuzzleCluster.isReady = true;
      
      kuzzleCluster.indexDeleted({
        index: 'index',
        result: {acknowledged: true}
      });
      should(kuzzleCluster.node.broker.broadcast).be.calledOnce();
      should(kuzzleCluster.node.broker.broadcast).be.calledWith('cluster:update', {
        ic: {'-': [{i: 'index'}]}
      });
    });
    
  });
  
  describe('#indiciesDeleted', () => {
    
    it('should do nothing if not ready', () => {
      kuzzleCluster.node = {broker: {broadcast: sinon.spy()}};
      kuzzleCluster.isReady = false;
      
      kuzzleCluster.indiciesDeleted({});
      should(kuzzleCluster.node.broker.broadcast).have.callCount(0);
    });

    it('should do nothing if no index is given', () => {
      kuzzleCluster.node = {broker: {broadcast: sinon.spy()}};
      kuzzleCluster.isReady = true;

      kuzzleCluster.indiciesDeleted({});
      kuzzleCluster.indiciesDeleted({
        result: {}
      });
      kuzzleCluster.indiciesDeleted({
        result: {deleted: []}
      });
      should(kuzzleCluster.node.broker.broadcast).have.callCount(0);
    });
    
    it('should broadcast an ic diff', () => {
      kuzzleCluster.node = {broker: {broadcast: sinon.spy()}};
      kuzzleCluster.isReady = true;
      
      kuzzleCluster.indiciesDeleted({
        result: {deleted: ['index1', 'index2', 'index3']}
      });
      should(kuzzleCluster.node.broker.broadcast).be.calledOnce();
      should(kuzzleCluster.node.broker.broadcast).be.calledWith('cluster:update', {
        ic: {'-': [
          {i: 'index1'},
          {i: 'index2'},
          {i: 'index3'}
        ]}
      });
    });
    
  });
  
  
  describe('#mappingUpdated', () => {
    
    it('should do nothing if not ready', () => {
      kuzzleCluster.node = {broker: {broadcast: sandbox.spy()}};
      kuzzleCluster.isReady = false;
      
      kuzzleCluster.mappingUpdated({});
      should(kuzzleCluster.node.broker.broadcast).have.callCount(0);
    });
    
    it('should broadcast an ic diff', () => {
      kuzzleCluster.node = { broker: { broadcast: sandbox.spy() }};
      kuzzleCluster.isReady = true;
      
      kuzzleCluster.mappingUpdated({
        index: 'index',
        collection: 'collection'
      });
      should(kuzzleCluster.node.broker.broadcast).be.calledOnce();
      should(kuzzleCluster.node.broker.broadcast).be.calledWith('cluster:update', {
        ic: { '+': [{i: 'index', c: 'collection'}]}
      });
    });
    
  });
  
  describe('#subscriptionAdded', () => {
    
    it('should do nothgin if not ready', () => {
      kuzzleCluster.node = {broker: {broadcast: sinon.spy()}};
      kuzzleCluster.isReady = false;
      
      kuzzleCluster.subscriptionAdded({});
      should(kuzzleCluster.node.broker.broadcast).have.callCount(0);
    });
    
    it('should broadcast the received diff', () => {
      var diff = {
        foo: 'bar'
      };
      
      kuzzleCluster.node = {broker: {broadcast: sandbox.spy()}};
      kuzzleCluster.isReady = true;
      
      kuzzleCluster.subscriptionAdded(diff);
      should(kuzzleCluster.node.broker.broadcast).be.calledOnce();
      should(kuzzleCluster.node.broker.broadcast).be.calledWith('cluster:update', diff);
    });
    
  });

  describe('#subscriptionJoined', () => {
    
    it('should do nothing if not ready', () => {
      kuzzleCluster.node = {broker: {broadcast: sinon.spy()}};
      kuzzleCluster.isReady = false;
      
      kuzzleCluster.subscriptionJoined({});
      should(kuzzleCluster.node.broker.broadcast).have.callCount(0);
    });

    it('should broadcast the received diff', () => {
      var diff = {
        foo: 'bar'
      };

      kuzzleCluster.node = {broker: {broadcast: sandbox.spy()}};
      kuzzleCluster.isReady = true;

      kuzzleCluster.subscriptionJoined(diff);
      should(kuzzleCluster.node.broker.broadcast).be.calledOnce();
      should(kuzzleCluster.node.broker.broadcast).be.calledWith('cluster:update', diff);
    });

  });

  describe('#subscriptionOff', () => {
    
    it('should do nothing if not ready', () => {
      kuzzleCluster.node = {broker: {broadcast: sinon.spy()}};
      kuzzleCluster.isReady = false;
      
      kuzzleCluster.subscriptionOff({});
      should(kuzzleCluster.node.broker.broadcast).have.callCount(0);
    });
    
    it('should broadcast an hcDel diff', () => {
      kuzzleCluster.node = {broker: {broadcast: sandbox.spy()}};
      kuzzleCluster.isReady = true;
      
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

});
