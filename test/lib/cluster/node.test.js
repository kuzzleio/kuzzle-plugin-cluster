var
  rewire = require('rewire'),
  should = require('should'),
  sinon = require('sinon'),
  Node = rewire('../../../lib/cluster/node'),
  sandbox = sinon.sandbox.create(),
  Request = require('kuzzle-common-objects').Request,
  RequestContext = require('kuzzle-common-objects').models.RequestContext;

describe('lib/cluster/node', () => {
  var
    clusterHandler,
    context,
    options = {foo: 'bar'},
    node;

  before(() => {
    clusterHandler = {
      uuid: 'uuid'
    };
    context = {
      accessors: {
        kuzzle: {
          indexCache: {
            add: sandbox.spy(),
            remove: sandbox.spy(),
            reset: sandbox.spy()
          },
          dsl: {
            storage: {
              store: sandbox.spy()
            }
          },
          hotelClerk: {
            rooms: {},
            customers: {},
            addRoomForCustomer: sandbox.spy(),
            removeRooms: sandbox.spy(),
            removeRoomForCustomer: sandbox.spy()
          },
          pluginsManager: {
            trigger: sandbox.spy()
          },
          services: {
            list: {
              storageEngine: {
                setAutoRefresh: sandbox.spy()
              }
            }
          },
          validation: {
            curateSpecification: sandbox.spy()
          }
        }
      }
    };
    node = new Node(clusterHandler, context, options);

    node.broker = { listen: sandbox.spy(), close: sandbox.spy() };
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('#constructor', () => {

    it('should construct a valid node object', () => {
      should(node.clusterHandler).be.exactly(clusterHandler);
      should(node.context).be.exactly(context);
      should(node.options).be.exactly(options);

      should(node.kuzzle).be.exactly(context.accessors.kuzzle);
    });

  });

  describe('#addDiffListeners', () => {

    it('should attach the listener to the broker', () => {
      node.addDiffListener();

      should(node.broker.listen).be.calledOnce();
      should(node.broker.listen).be.calledWith('cluster:update');
    });

  });

  describe('#destroy', () => {

    it('should do its job', () => {
      node.destroy();

      should(node.broker.reconnect).be.false();
      should(node.broker.close).be.calledOnce();
      should(node.isReady).be.false();
    });

  });

  describe('#merge', () => {
    var rewireRevert;

    before(() => {
      rewireRevert = Node.__set__({
        mergeAddRoom: sinon.spy(),
        mergeDelRoom: sinon.spy(),
        updateAutoRefresh: sinon.spy()
      });
    });

    after(() => {
      rewireRevert();
    });

    it('should call kuzzle.indexCache.add with proper values when an `icAdd` key is given', () => {
      node.merge({icAdd: {i: 'index', c: 'collection'}});

      should(node.kuzzle.indexCache.add).be.calledOnce();
      should(node.kuzzle.indexCache.add).be.calledWithExactly('index', 'collection', false);
    });

    it('should call kuzzle.indexCache.remove with proper values when an `icDel` key is given', () => {
      node.merge({icDel: {i: 'index', c: 'collection'}});

      should(node.kuzzle.indexCache.remove).be.calledOnce();
      should(node.kuzzle.indexCache.remove).be.calledWithExactly('index', 'collection', false);
    });

    it('should call kuzzle.indexCache.reset with proper values when an `icReset` key is given', () => {
      node.merge({icReset: {i: 'index'}});

      should(node.kuzzle.indexCache.reset).be.calledOnce();
      should(node.kuzzle.indexCache.reset).be.calledWithExactly('index', false);
    });

    it('should call the mergeAddRoom function when an `hcR` key is given', () => {
      node.merge([{hcR: {}}]);

      should(Node.__get__('mergeAddRoom')).be.calledOnce();
      should(Node.__get__('mergeAddRoom')).be.calledWith(node.kuzzle.hotelClerk, {});
    });

    it('should call the mergeDelRoom function when an `hcDel` key is given', () => {
      node.merge({hcDel: {}});

      should(Node.__get__('mergeDelRoom')).be.calledOnce();
      should(Node.__get__('mergeDelRoom')).be.calledWith(node.kuzzle.hotelClerk, {});
    });

    it('should call the updateAutoRefresh function when an `ar` key is given', () => {
      node.merge({ar: {i: 'index', v: 'value'}});

      should(Node.__get__('updateAutoRefresh')).be.calledOnce();
      should(Node.__get__('updateAutoRefresh')).be.calledWithExactly(node.kuzzle.services.list.storageEngine, 'index', 'value');
    });

    it('should store the new filters subscription when an `ftAdd` key is given', () => {
      node.merge({ftAdd: {i: 'index', c: 'collection', f: {some: 'filters'}}});

      should(context.accessors.kuzzle.dsl.storage.store).be.calledOnce();
      should(context.accessors.kuzzle.dsl.storage.store).be.calledWithMatch('index', 'collection', {some: 'filters'});
    });

    it('should trigger an update specifications when an `vu` key is given', () => {
      node.merge({vu: {}});

      should(context.accessors.kuzzle.validation.curateSpecification).be.calledOnce();
    });
  });

  describe('#mergeAddRoom', () => {
    var mergeAddRoom = Node.__get__('mergeAddRoom');

    it('should update the hotelclerk', () => {
      mergeAddRoom(node.kuzzle.hotelClerk, {
        i: 'index',
        c: 'collection',
        ch: ['channelId', 'states'],
        r: 'roomId',
        cx: {i: 'myconnection', p: 'foo'},
        m: {meta: 'data'}
      });

      should(node.kuzzle.hotelClerk.rooms).be.eql({
        roomId: {
          id: 'roomId',
          customers: [],
          index: 'index',
          collection: 'collection',
          channels: { channelId: 'states' }
        }
      });

      should(node.kuzzle.hotelClerk.addRoomForCustomer).be.calledOnce();
      should(node.kuzzle.hotelClerk.addRoomForCustomer.firstCall.args[0]).be.instanceOf(Request);
      should(node.kuzzle.hotelClerk.addRoomForCustomer.firstCall.args[0].context.connectionId).be.eql('myconnection');
      should(node.kuzzle.hotelClerk.addRoomForCustomer.firstCall.args[1]).be.eql('roomId');
      should(node.kuzzle.hotelClerk.addRoomForCustomer.firstCall.args[2]).match({meta: 'data'});
    });

  });

  describe('#mergeDelRoom', () => {
    var mergeDelRoom = Node.__get__('mergeDelRoom');

    it('should remove the room entry', () => {
      mergeDelRoom(node.kuzzle.hotelClerk, {
        c: {i: 'myconnection'},
        r: 'roomId'
      });

      should(node.kuzzle.hotelClerk.removeRoomForCustomer).be.calledOnce();
      should(node.kuzzle.hotelClerk.removeRoomForCustomer.firstCall.args[0]).be.instanceOf(RequestContext);
      should(node.kuzzle.hotelClerk.removeRoomForCustomer.firstCall.args[0].connectionId).be.eql('myconnection');
      should(node.kuzzle.hotelClerk.removeRoomForCustomer.firstCall.args[1]).be.eql('roomId');
      should(node.kuzzle.hotelClerk.removeRoomForCustomer.firstCall.args[2]).be.false();
    });
  });

  describe('#updateAutoRefresh', () => {
    var updateAutoRefresh = Node.__get__('updateAutoRefresh');

    it('should call kuzzle write engine with a valid requestObject', () => {
      var
        request;

      updateAutoRefresh(node.kuzzle.services.list.storageEngine, 'index', 'value');

      should(node.kuzzle.services.list.storageEngine.setAutoRefresh).be.calledOnce();
      request = node.kuzzle.services.list.storageEngine.setAutoRefresh.firstCall.args[0];

      should(request).be.instanceOf(Request);
      should(request.input.resource.index).be.exactly('index');
      should(request.input.controller).be.exactly('admin');
      should(request.input.action).be.exactly('setAutoRefresh');
      should(request.input.body.autoRefresh).be.exactly('value');
    });

  });

});
