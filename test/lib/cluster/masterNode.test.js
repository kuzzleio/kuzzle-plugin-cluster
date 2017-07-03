const
  should = require('should'),
  sinon = require('sinon'),
  MasterNode = require('../../../lib/cluster/masterNode'),
  Node = require('../../../lib/cluster/node');

describe('lib/cluster/masterNode', () => {
  let
    clusterHandler,
    context,
    options = {some: 'options'},
    node;

  beforeEach(() => {
    clusterHandler = {
      uuid: 'uuid',
      config: {
        binding: {
          host: '1.2.3.4',
          port: 5678,
          retryInterval: 42
        }
      }
    };

    context = {
      accessors: {
        kuzzle: {
          services: {
            list: {
              broker: {
                broadcast: sinon.spy(),
                onConnectHandlers: [],
                onCloseHandlers: [],
                onErrorHandlers: [],
                listen: sinon.spy(),
                send: sinon.spy()
              }
            }
          },
          hotelClerk: {
            rooms: {
              r1: {
                id: 'r1',
                index: 'i1',
                collection: 'c1',
                channels: ['r1-a', 'r1-b'],
                customers: new Set(['cust1', 'cust2'])
              },
              r2: {
                id: 'r2',
                index: 'i1',
                collection: 'c2',
                channels: ['r2-a'],
                customers: new Set(['cust2', 'cust3', 'cust4'])
              },
              r3: {
                id: 'r3',
                index: 'i2',
                collection: 'c',
                channels: [],
                customers: new Set(['cust3'])
              }
            },
            customers: 'customers'
          },
          dsl: {storage: { filters: { fId: {index: 'index', collection: 'collection', filters: 'filters'}}}},
          indexCache: { indexes: 'indexes' }
        }
      }};

    options = {some: 'options'};

    node = new MasterNode(clusterHandler, context, options);
  });

  describe('#constructor', () => {

    it('should setup a valid master node', () => {
      should(node.clusterHandler).be.exactly(clusterHandler);
      should(node.context).be.exactly(context);
      should(node.options).be.exactly(options);
      should(node.kuzzle).be.exactly(context.accessors.kuzzle);
      should(node).have.property('slaves');
      should(node.slaves).be.an.Object();
      should(node.slaves).be.empty();
      should(node.isReady).be.false();

      should(node).be.an.instanceof(Node);
    });

  });

  describe('#init', () => {

    it('should set the broker and attach the listeners', () => {
      node.attachEvents = sinon.spy();

      return node.init()
        .then(() => {
          should(node.broker).be.exactly(context.accessors.kuzzle.services.list.broker);
          should(node.attachEvents)
            .be.calledOnce();
          should(node.isReady)
            .be.true();
        });
    });

  });

  describe('#attachEvents', () => {

    beforeEach(() => {
      node.broker = context.accessors.kuzzle.services.list.broker;
    });

    it('should do its job', () => {
      node.addDiffListener = sinon.spy();

      node.attachEvents();

      should(node.broker.listen).be.calledOnce();
      should(node.broker.listen).be.calledWith('cluster:join');
      should(node.addDiffListener).be.calledOnce();

      // cb test
      node.broker.listen.firstCall.args[1].call(node, {uuid:'foobar', options: {binding: 'binding'}});

      should(node.broker.send).be.calledOnce();
      should(node.broker.send).be.calledWith('cluster:foobar', {
        action: 'snapshot',
        data: {
          hc: {
            r: node._serializeRooms(node.kuzzle.hotelClerk.rooms),
            c: node.kuzzle.hotelClerk.customers
          },
          fs: [{idx: 'index', coll: 'collection', f: 'filters'}],
          ic: context.accessors.kuzzle.indexCache.indexes
        }
      });

      should(node.broker.onErrorHandlers).have.length(1);

      node.isReady = true;
      node.broker.onErrorHandlers[0]();
      should(node.isReady).be.false();


      // on close handler should broadcast the client disconnection
      let onClose = node.broker.onCloseHandlers[0];

      node.slaves = {
        foo: 'bar'
      };
      node.clusterStatus = {
        nodesCount: 2,
        slaves: node.slaves         // /!\ <= needs to be a reference
      };

      onClose.call(node, 'cluster:foo');
      should(node.broker.broadcast)
        .be.calledWith('cluster:update', [{cs: node.clusterStatus}]);

      should(node.clusterStatus.slaves)
        .be.empty();
      should(node.clusterStatus.nodesCount)
        .be.eql(1);

    });

  });

});
