var
  rewire = require('rewire'),
  should = require('should'),
  sinon = require('sinon'),
  Node = rewire('../../../lib/cluster/node'),
  sandbox = sinon.sandbox.create(),
  RequestObject = require('kuzzle-common-objects').Models.requestObject;

describe('lib/cluster/node', () => {
  var
    context,
    options = {foo: 'bar'},
    node;

  before(() => {
    context = {
      accessors: {
        kuzzle: {
          indexCache: {
            add: sandbox.spy(),
            remove: sandbox.spy(),
            reset: sandbox.spy()
          },
          dsl: {
            filters: {
              add: sandbox.spy(() => {
                return {path: 'path', filter: 'filter'};
              }),
              addCollectionSubscription: sandbox.spy(),
              filters: {}
            }
          },
          hotelClerk: {
            rooms: {},
            customers: {},
            addRoomForCustomer: sandbox.spy(),
            removeRooms: sandbox.spy(),
            removeRoomForCustomer: sandbox.spy()
          },
          hooks: {
            list: {
              write: {broadcast: sandbox.spy()}
            }
          },
          pluginsManager: {
            trigger: sinon.spy()
          },
          services: {
            list: {
              writeEngine: {
                setAutoRefresh: sinon.spy()
              }
            }
          }
        }
      }
    };
    node = new Node(context, options);

    node.broker = { listen: sandbox.spy(), close: sandbox.spy() };
  });

  afterEach(() => {
    sandbox.restore();
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
    var
      merge,
      rewireRevert;

    before(() => {
      rewireRevert = Node.__set__({
        mergeAddRoom: sinon.spy(),
        mergeDelRoom: sinon.spy(),
        mergeDelRooms: sinon.spy(),
        mergeFilterTree: sinon.spy(),
        updateAutoRefresh: sinon.spy()
      });
      merge = Node.__get__('merge');
    });

    after(() => {
      rewireRevert();
    });

    it('should call kuzzle.indexCache.add with proper values when an `icAdd` key is given', () => {
      merge.call(node, {icAdd: {i: 'index', c: 'collection'}});
      
      should(node.kuzzle.indexCache.add).be.calledOnce();
      should(node.kuzzle.indexCache.add).be.calledWithExactly('index', 'collection', false);
    });
    
    it('should call kuzzle.indexCache.remove with proper values when an `icDel` key is given', () => {
      merge.call(node, {icDel: {i: 'index', c: 'collection'}});
      
      should(node.kuzzle.indexCache.remove).be.calledOnce();
      should(node.kuzzle.indexCache.remove).be.calledWithExactly('index', 'collection', false);
    });
    
    it('should call kuzzle.indexCache.reset with proper values when an `icReset` key is given', () => {
      merge.call(node, {icReset: {i: 'index'}});
      
      should(node.kuzzle.indexCache.reset).be.calledOnce();
      should(node.kuzzle.indexCache.reset).be.calledWithExactly('index', false);
    });

    it('should call the mergeAddRoom function when an `hcR` key is given', () => {
      merge.call(node, [{hcR: true}]);

      should(Node.__get__('mergeAddRoom')).be.calledOnce();
      should(Node.__get__('mergeAddRoom')).be.calledWith(true);
    });

    it('should call the mergeDelRoom function when an `hcDel` key is given', () => {
      merge.call(node, {hcDel: true});

      should(Node.__get__('mergeDelRoom')).be.calledOnce();
      should(Node.__get__('mergeDelRoom')).be.calledWith(true);
    });
    
    it('should call the mergeDelRooms function when an `hcDelMul` key is given', () => {
      merge.call(node, {hcDelMul: true});
      
      should(Node.__get__('mergeDelRooms')).be.calledOnce();
      should(Node.__get__('mergeDelRooms')).be.calledWith(true);
    });

    it('should call the mergeFilterTree function when an `ft`key is given', () => {
      merge.call(node, {ft: true});

      should(Node.__get__('mergeFilterTree')).be.calledOnce();
      should(Node.__get__('mergeFilterTree')).be.calledWith(true);
    });

    it('should call kuzzle.dsl.filters.addCollectionSubscription with proper values when a `ftG` key is given', () => {
      merge.call(node, {ftG: {i: 'index', c: 'collection', fi: 'filterId'}});
      
      should(node.kuzzle.dsl.filters.addCollectionSubscription).be.calledOnce();
      should(node.kuzzle.dsl.filters.addCollectionSubscription).be.calledWithExactly('filterId', 'index', 'collection');
    });
    
    it('should call the updateAutoRefresh function when an `ar` key is given', () => {
      merge.call(node, {ar: {i: 'index', v: 'value'}});
      
      should(Node.__get__('updateAutoRefresh')).be.calledOnce();
      should(Node.__get__('updateAutoRefresh')).be.calledWithExactly('index', 'value');
    });
    
  });

  describe('#mergeAddRoom', () => {
    var mergeAddRoom = Node.__get__('mergeAddRoom');

    it('should update the hotelclerk', () => {
      mergeAddRoom.call(node, {
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
      mergeDelRoom.call(node, {
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
      
      mergeDelRooms.call(node, {i: 'index', c: 'collection', r: ['room1', 'room2']});

      should(node.kuzzle.hotelClerk.removeRooms).be.calledOnce();
      response = node.kuzzle.hotelClerk.removeRooms.firstCall.args[0];
      should(response).be.an.instanceOf(RequestObject);
      should(response.index).be.exactly('index');
      should(response.collection).be.exactly('collection');
      should(response.data.body.rooms).be.eql(['room1', 'room2']);
    });
  });

  describe('#mergeFilterTree', () => {
    var mergeFilterTree = Node.__get__('mergeFilterTree');

    it('should call filters::add with valid values', () => {
      mergeFilterTree.call(node, {
        i: 'index',
        c: 'collection',
        f: 'foo',
        o: 'term',
        v: 'bar',
        fn: 'psFN3PWCau+CKQl9gdT23g==',
        fi: '5761ee80ef2676204f6b3ac960779586',
        n: true,
        g: true
      });

      should(node.kuzzle.dsl.filters.add).be.calledOnce();
      should(node.kuzzle.dsl.filters.add).be.calledWith(
        'index',
        'collection',
        'foo',
        'term',
        'bar',
        'psFN3PWCau+CKQl9gdT23g==',
        '5761ee80ef2676204f6b3ac960779586',
        true,
        true
      );
    });
  });

  describe('#updateAutoRefresh', () => {
    var updateAutoRefresh = Node.__get__('updateAutoRefresh');

    it('should call kuzzle write engine with a valid requestObject', () => {
      var 
        requestObject;
      
      updateAutoRefresh.call(node, 'index', 'value');

      should(node.kuzzle.services.list.writeEngine.setAutoRefresh).be.calledOnce();
      requestObject = node.kuzzle.services.list.writeEngine.setAutoRefresh.firstCall.args[0];

      should(requestObject.index).be.exactly('index');
      should(requestObject.controller).be.exactly('admin');
      should(requestObject.action).be.exactly('setAutoRefresh');
      should(requestObject.data.body.autoRefresh).be.exactly('value');
    });

  });

});
