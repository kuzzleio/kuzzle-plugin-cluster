var
  rewire = require('rewire'),
  should = require('should'),
  sinon = require('sinon'),
  sandbox = sinon.sandbox.create(),
  MasterNode = rewire('../../../lib/cluster/masterNode'),
  Node = require('../../../lib/cluster/node'),
  Slave = sinon.spy();

describe('lib/cluster/masterNode', () => {
  var
    context = {
      uuid: 'uuid',
      accessors: {
        kuzzle: {
          services: { list: { broker: {} } },
          hotelClerk: { rooms: 'rooms', customers: 'customers' },
          dsl: { filters: { filtersTree: 'filterTree', filters: 'filters' } },
          indexCache: { indexes: 'indexes' }
        }
      }},
    options = {some: 'options'};
  
  afterEach(() => {
    sandbox.restore();
  });

  describe('#constructor', () => {

    it('should setup a valid master node', () => {
      var 
        node = new MasterNode(context, options);

      should(node.options).be.exactly(options);
      should(node.kuzzle).be.exactly(context.accessors.kuzzle);
      should(node.uuid).be.exactly(context.uuid);
      should(node).have.property('slaves');
      should(node.slaves).be.an.Object();
      should(node.slaves).be.empty();
    });
    
    it('should inherit from Node', () => {
      var node = new MasterNode(context, options);
      
      should(node).be.an.instanceOf(Node);
    });
    
  });

  describe('#init', () => {
    var 
      node,
      spy = sinon.spy(),
      revert;
    
    before(() => {
      revert = MasterNode.__set__('attachEvents', spy);
      node = new MasterNode(context, options);
    });
    
    after(() => {
      revert();
    });

    it('should set the broker and attach the listeners', () => {
      node.init();
      
      should(node.broker).be.exactly(context.accessors.kuzzle.services.list.broker);
      should(spy).be.calledOnce();
    });

  });

  describe('#attachEvents', () => {
    var
      attachEvents = MasterNode.__get__('attachEvents'),
      cb,
      node = {
        addDiffListener: sinon.spy(),
        broker: {
          listen: sandbox.spy((channel, callback) => { cb = callback; }),
          send: sandbox.spy(),
          onConnectHandlers: [],
          onCloseHandlers: [],
          onErrorHandlers: []
        },
        kuzzle: context.accessors.kuzzle,
        slaves: {}
      },
      revert;
    
    before(() => {
      revert = MasterNode.__set__({
        _context: 'context',
        Slave
      });
    });
    
    after(() => {
      revert();
    });

    it('should do its job', () => {
      
      attachEvents.call(node);
      
      should(node.broker.listen).be.calledOnce();
      should(node.broker.listen).be.calledWith('cluster:join', cb);
      should(node.addDiffListener).be.calledOnce();
      
      // cb test
      cb.call(node, {uuid:'foobar', options: {binding: 'binding'}});
      
      should(node.broker.send).be.calledOnce();
      should(node.broker.send).be.calledWith('cluster:foobar', {
        action: 'snapshot',
        data: {
          hc: {
            rooms: context.accessors.kuzzle.hotelClerk.rooms,
            customers: context.accessors.kuzzle.hotelClerk.customers
          },
          ft: {
            t: context.accessors.kuzzle.dsl.filters.filtersTree,
            f: context.accessors.kuzzle.dsl.filters.filters
          },
          ic: context.accessors.kuzzle.indexCache.indexes
        }
      });
      
      should(node.broker.onErrorHandlers).have.length(1);
      
      node.isReady = true;
      node.broker.onErrorHandlers[0]();
      should(node.isReady).be.false();
    });

  });

});
