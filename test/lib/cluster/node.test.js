var
  rewire = require('rewire'),
  should = require('should'),
  sinon = require('sinon'),
  Node = rewire('../../../lib/cluster/node'),
  sandbox = sinon.sandbox.create(),
  RequestObject = require('kuzzle-common-objects').Models.requestObject;

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
            trigger: sinon.spy()
          },
          services: {
            list: {
              storageEngine: {
                setAutoRefresh: sinon.spy()
              }
            }
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
        mergeDelRooms: sinon.spy(),
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

    it('should call the mergeDelRooms function when an `hcDelMul` key is given', () => {
      node.merge({hcDelMul: {}});

      should(Node.__get__('mergeDelRooms')).be.calledOnce();
      should(Node.__get__('mergeDelRooms')).be.calledWith(node.kuzzle.hotelClerk, {});
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
  });

  describe('#mergeAddRoom', () => {
    var mergeAddRoom = Node.__get__('mergeAddRoom');

    it('should update the hotelclerk', () => {
      mergeAddRoom(node.kuzzle.hotelClerk, {
        i: 'index',
        c: 'collection',
        ch: ['channelId', 'states'],
        r: 'roomId',
        cx: {id: 'myconnection'},
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
      should(node.kuzzle.hotelClerk.addRoomForCustomer).be.calledWith({id: 'myconnection'}, 'roomId', {meta: 'data'});
    });

  });

  describe('#mergeDelRoom', () => {
    var mergeDelRoom = Node.__get__('mergeDelRoom');

    it('should remove the room entry', () => {
      mergeDelRoom(node.kuzzle.hotelClerk, {
        c: {id: 'myconnection'},
        r: 'roomId'
      });

      should(node.kuzzle.hotelClerk.removeRoomForCustomer).be.calledOnce();
      should(node.kuzzle.hotelClerk.removeRoomForCustomer).be.calledWith({id: 'myconnection'}, 'roomId', false);
    });
  });

  describe('#mergeDelRooms', () => {
    var mergeDelRooms = Node.__get__('mergeDelRooms');

    it('should call hotelClerk::removeRooms', () => {
      var response;

      mergeDelRooms(node.kuzzle.hotelClerk, {i: 'index', c: 'collection', r: ['room1', 'room2']});

      should(node.kuzzle.hotelClerk.removeRooms).be.calledOnce();
      response = node.kuzzle.hotelClerk.removeRooms.firstCall.args[0];
      should(response).be.an.instanceOf(RequestObject);
      should(response.index).be.exactly('index');
      should(response.collection).be.exactly('collection');
      should(response.data.body.rooms).be.eql(['room1', 'room2']);
    });
  });

  describe('#updateAutoRefresh', () => {
    var updateAutoRefresh = Node.__get__('updateAutoRefresh');

    it('should call kuzzle write engine with a valid requestObject', () => {
      var
        requestObject;

      updateAutoRefresh(node.kuzzle.services.list.storageEngine, 'index', 'value');

      should(node.kuzzle.services.list.storageEngine.setAutoRefresh).be.calledOnce();
      requestObject = node.kuzzle.services.list.storageEngine.setAutoRefresh.firstCall.args[0];

      should(requestObject.index).be.exactly('index');
      should(requestObject.controller).be.exactly('admin');
      should(requestObject.action).be.exactly('setAutoRefresh');
      should(requestObject.data.body.autoRefresh).be.exactly('value');
    });

  });

});
