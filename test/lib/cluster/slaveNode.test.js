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
      kuzzle: {
        services: { list: { broker: {} } },
        hotelClerk: { rooms: 'rooms', customers: 'customers' },
        dsl: { filters: { filtersTree: 'filterTree', filters: 'filters' } },
        indexCache: 'indexCache'
      }},
    options = {binding: 'binding'};
  
  afterEach(() => {
    sandbox.restore();
  });

  describe('#constructor', () => {
    var 
      bindingSpy = sinon.spy(config => '_' + config),
      revert;
    
    before(() => {
      revert = SlaveNode.__set__({
        resolveBinding: bindingSpy
      });
    });
    
    after(() => {
      revert();
    });
    
    it('should create a valid slave node object', () => {
      var node = new SlaveNode(context, options);
      
      should(node.kuzzle).be.exactly(context.kuzzle);
      should(SlaveNode.__get__('_context')).be.exactly(context);
      should(node.options).be.exactly(options);
      should(bindingSpy).be.calledOnce();
      should(node.options.binding).be.exactly('_binding');
      should(node.uuid).be.exactly('yqIz9V3lrvUUKmRO0XVGQg==');
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
              broker: {
                WsBrokerClient: wsClientSpy
              }
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
      node = {
        addDiffListener: sinon.spy(),
        broker: {
          listen: sandbox.spy((channel, callback) => { cb = callback; }),
          send: sandbox.spy()
        },
        kuzzle: context.kuzzle,
        options: 'options',
        uuid: 'uuid'
      };

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
      should(node.kuzzle.indexCache).be.exactly('uindexCache');

    });


  });

  describe('#resolveBindings', () => {
    var
      resolveBinding = SlaveNode.__get__('resolveBinding'),
      revert;
    
    before(() => {
      revert = SlaveNode.__set__({
        _context: {
          kuzzle: {config: {internalBroker: {port: 999}}}
        }
      });
    });
    
    after(() => {
      revert();
    });

    it('should do its job', () => {
      should(resolveBinding('host')).be.exactly('host:999');
      should(resolveBinding('host:666')).be.exactly('host:666');
      should(resolveBinding('[lo:ipv4]')).match(/^(\d+\.){3}\d+:999$/);
      should(resolveBinding('[lo:ipv4]:666')).match(/^(\d+\.){3}\d+:666$/);

      should(() => resolveBinding('[invalidiface:ipv4]')).throw('Invalid network interface provided [invalidiface]');
      should(() => resolveBinding('[lo:invalid]')).throw('Invalid ip family provided [invalid] for network interface lo');
    });
    

  });
  
});
