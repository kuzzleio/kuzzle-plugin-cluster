const
  Promise = require('bluebird'),
  should = require('should'),
  sinon = require('sinon'),
  Node = require('../../../lib/cluster/node'),
  SlaveNode = require('../../../lib/cluster/slaveNode');

describe('lib/cluster/slaveNode', () => {
  let
    broker,
    clusterHandler = {
      uuid: 'uuid'
    },
    options = {binding: 'binding', host: '_host', port: '_port'},
    context,
    node;

  beforeEach(() => {
    broker = {
      _pingRequestIntervalId: true,
      _pingRequestTimeoutId: true,
      client: {
        socket: {
          removeAllListeners: sinon.spy()
        }
      },
      close: sinon.spy(),
      listen: sinon.spy(),
      onConnectHandlers: [],
      onCloseHandlers: [],
      onErrorHandlers: [],
      send: sinon.spy(),
      unsubscribe: sinon.spy()
    };

    context = {
      uuid: 'uuid',
      accessors: {
        kuzzle: {
          services: {
            list: {
              broker: {},
              proxyBroker: {
                client: {
                  socket: {
                    emit: sinon.spy()
                  }
                }
              }
            }
          },
          hotelClerk: { rooms: 'rooms', customers: 'customers' },
          dsl: {storage: { store: sinon.stub() }},
          indexCache: { indexes: 'indexes' }
        }
      },
      constructors: {
        services: {
          WsBrokerClient: sinon.spy(function () {
            return {
              init: sinon.stub().returns(Promise.resolve()),
              listen: sinon.spy(),
              onConnectHandlers: [],
              onCloseHandlers: [],
              onErrorHandlers: [],
              send: sinon.spy()
            };
          })
        }
      }
    };

    node = new SlaveNode(clusterHandler, context, options);
  });

  describe('#constructor', () => {

    it('should create a valid slave node object', () => {
      should(node.kuzzle).be.exactly(context.accessors.kuzzle);
      should(node.options).be.exactly(options);
      should(node).be.an.instanceOf(Node);
    });
  });

  describe('#init', () => {
    it('should set the broker and attach the events', () => {
      node.attachEvents = sinon.spy();

      return node.init()
        .then(() => {
          should(node.broker).be.an.Object();

          const wsClientSpy = context.constructors.services.WsBrokerClient;

          should(wsClientSpy).be.calledOnce();
          should(wsClientSpy).be.calledWith(
            'cluster',
            node.options,
            node.kuzzle.pluginsManager,
            true
          );
          should(node.attachEvents).be.calledOnce();
        });
    });

  });

  describe('#detach', () => {

    beforeEach(() => {
      node.broker = broker;
    });

    it('should properly close the client connection', () => {
      node.detach();

      should(broker.onConnectHandlers)
        .be.empty();
      should(broker.onCloseHandlers)
        .be.empty();
      should(broker.onErrorHandlers)
        .be.empty();

      // closing connection
      should(broker.close)
        .be.calledOnce();

      should(node.broker)
        .be.null();
    });

  });

  describe('#attachEvents', () => {
    beforeEach(() => {
      node.broker = broker;
    });

    it('should set up the listeners to collect information from the master', () => {
      node.addDiffListener = sinon.spy();
      node.join = sinon.spy();

      node.attachEvents();

      should(node.addDiffListener)
        .be.calledOnce();

      should(node.broker.listen)
        .be.calledOnce()
        .be.calledWith('cluster:uuid');

      let
        listenCB = node.broker.listen.firstCall.args[1],
        msg = {
          action: 'snapshot',
          data: {
            fs: [
              {idx: 0, coll: 'foo', f: 'filter'},
              {idx: 2, coll: 'bar', f: 'doh'}
            ],
            hc: {
              r: {
                r1: {
                  id: 'r1',
                  index: 'i1',
                  collection: 'c1',
                  channels: ['r1-a'],
                  customers: ['cust1', 'cust2']
                },
                r2: {
                  id: 'r2',
                  index: 'i1',
                  collection: 'c2',
                  channels: ['r2-a', 'r2-b'],
                  customers: ['cust3']
                }
              },
              c: 'customers'
            }
          }
        };
      listenCB.call(node, msg);

      should(node.kuzzle.hotelClerk.rooms)
        .be.eql(node._unserializeRooms(msg.data.hc.r));
      should(node.kuzzle.hotelClerk.customers)
        .be.eql(msg.data.hc.c);
      should(node.kuzzle.dsl.storage.store)
        .be.calledTwice();
      should(node.isReady)
        .be.true();


      should(node.join)
        .be.calledOnce();

      should(node.broker.onConnectHandlers)
        .have.length(1);
      should(node.broker.onCloseHandlers)
        .have.length(1);
      should(node.broker.onErrorHandlers)
        .have.length(1);

      // errorhandler
      let onErrorCb = node.broker.onErrorHandlers[0];

      // @kuzzle pending update
      // should deal with undefined error
      onErrorCb();
      should(node.kuzzle.services.list.proxyBroker.client.socket.emit)
        .be.calledOnce();

      let err = new Error('test');

      onErrorCb(err);
      should(node.kuzzle.services.list.proxyBroker.client.socket.emit)
        .be.calledTwice();
      let sentError = node.kuzzle.services.list.proxyBroker.client.socket.emit.secondCall.args[1];
      should(sentError.message)
        .be.eql('test');

    });

  });

  describe('#join', () => {

    it('should send a join request to the master', () => {
      node.broker = broker;

      node.join();

      should(node.broker.send)
        .be.calledOnce()
        .be.calledWith('cluster:join');
    });

  });

});
