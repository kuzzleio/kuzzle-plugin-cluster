var
  q = require('q'),
  rewire = require('rewire'),
  should = require('should'),
  sinon = require('sinon'),
  sandbox = sinon.sandbox.create(),
  Node = require('../../../lib/cluster/node'),
  SlaveNode = rewire('../../../lib/cluster/slaveNode');

describe('lib/cluster/slaveNode', () => {
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
      }
    },
    options = {binding: 'binding', host: '_host', port: '_port'};
  
  afterEach(() => {
    sandbox.restore();
  });

  describe('#constructor', () => {
    
    it('should create a valid slave node object', () => {
      var node = new SlaveNode(context, options);
      
      should(node.kuzzle).be.exactly(context.accessors.kuzzle);
      should(SlaveNode.__get__('_context')).be.exactly(context);
      should(node.options).be.exactly(options);
      should(node.uuid).be.exactly('6uohu5GXyKj+qujAtrF1FA==');
    });
    
    it('should inherit from Node', () => {
      var node = new SlaveNode(context, options);
      
      should(node).be.an.instanceOf(Node);
    });
  });

  describe('#init', () => {
    var 
      attachEventsSpy = sinon.spy(),
      wsClientSpy = sinon.spy(function () {
        this.init = () => q();    // eslint-disable-line no-invalid-this
      }),
      revert;
    
    before(() => {
      revert = SlaveNode.__set__({
        _context: {
          constructors: {
            services: {
              WsBrokerClient: wsClientSpy
            }
          }
        },
        attachEvents: attachEventsSpy
      });
    });
    
    after(() => {
      revert();
    });
    
    
    it('shoud set the broker and attach the events', () => {
      var node = {
        options: 'options',
        kuzzle: {pluginsManager: 'pluginsManager'}
      };
      
      return SlaveNode.prototype.init.call(node)
        .then(() => {
          should(node.broker).be.an.Object();
          should(wsClientSpy).be.calledOnce();
          should(wsClientSpy).be.calledWith(
            'cluster',
            'options',
            'pluginsManager',
            true
          );
          should(attachEventsSpy).be.calledOnce();
        });
    });
    
  });
  
  describe('#attachEvents', () => {
    var
      attachEvents = SlaveNode.__get__('attachEvents'),
      cb,
      joinSpy,
      node = {
        addDiffListener: sinon.spy(),
        broker: {
          listen: sandbox.spy((channel, callback) => { cb = callback; }),
          send: sandbox.spy(),
          onCloseHandlers: [],
          onErrorHandlers: [],
          onConnectHandlers: []
        },
        kuzzle: context.accessors.kuzzle,
        options: 'options',
        uuid: 'uuid'
      },
      reset;
    
    before(() => {
      joinSpy = sandbox.spy(SlaveNode.__get__('join'));
      reset = SlaveNode.__set__('join', joinSpy);
    });
    
    after(() => {
      reset();
    });

    it('should do its job', () => {
      attachEvents.call(node);

      should(node.broker.listen).be.calledOnce();
      should(node.broker.listen).be.calledWith('cluster:uuid', cb);
      should(node.broker.send).be.calledOnce();
      should(node.broker.send).be.calledWith('cluster:join', {
        uuid: 'uuid',
        options: 'options'
      });
      should(node.addDiffListener).be.calledOnce();
      should(joinSpy).be.calledOnce();
      should(node.broker.onConnectHandlers).have.length(1);
      should(node.broker.onCloseHandlers).have.length(1);
      should(node.broker.onErrorHandlers).have.length(1);
      
      // onJoin
      node.isReady = false;
      node.broker.onConnectHandlers[0]();
      should(joinSpy).have.callCount(2);
      
      // onClose
      node.isReady = true;
      node.broker.onCloseHandlers[0]();
      should(node.isReady).be.false();
      
      // onError
      node.isReady = true;
      node.broker.onErrorHandlers[0]();
      should(node.isReady).be.false();
      
      // cb
      cb.call(node, {
        action: 'snapshot',
        data: {
          hc: {rooms: 'urooms', customers: 'ucustomers'},
          ft: {t: 'ufiltersTree', f: 'ufilters'},
          ic: 'uindexCache'
        }
      });
      
      should(node.kuzzle.hotelClerk.rooms).be.exactly('urooms');
      should(node.kuzzle.hotelClerk.customers).be.exactly('ucustomers');
      should(node.kuzzle.dsl.filters.filtersTree).be.exactly('ufiltersTree');
      should(node.kuzzle.dsl.filters.filters).be.exactly('ufilters');
      should(node.kuzzle.indexCache.indexes).be.exactly('uindexCache');
      
      
    });

  });

});
