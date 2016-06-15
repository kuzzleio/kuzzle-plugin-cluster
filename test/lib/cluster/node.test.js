var
  rewire = require('rewire'),
  should = require('should'),
  sinon = require('sinon'),
  Node = rewire('../../../lib/cluster/node'),
  sandbox = sinon.sandbox.create(),
  RequestObject = require('kuzzle-common-objects').Models.requestObject;

describe('lib/cluster/node', () => {
  var
    node;

  beforeEach(() => {
    node = new Node();

    node.broker = { listen: sandbox.spy() };
    node.kuzzle = {
      indexCache: {
        add: sandbox.spy(),
        remove: sandbox.spy()
      },
      dsl: {
        filters: {
          add: sandbox.spy()
        }
      },
      hotelClerk: {
        rooms: {},
        customers: {},
        addRoomForCustomer: sandbox.spy(),
        removeRooms: sandbox.spy(),
        removeRoomForCustomer: sandbox.spy()
      }
    };
  });

  afterEach(() => {
    sandbox.restore();
  });


  describe('#addDifflisted', () => {

    it('should attach the listener to the broker', () => {
      node.addDiffListener();

      should(node.broker.listen).be.calledOnce();
      should(node.broker.listen).be.calledWith('cluster:update');
    });

  });

  describe('#merge', () => {
    var
      merge,
      rewireRevert;

    before(() => {
      rewireRevert = Node.__set__({
        mergeIndexCache: sinon.spy(),
        mergeAddRoom: sinon.spy(),
        mergeDelRoom: sinon.spy(),
        mergeDelRooms: sinon.spy(),
        mergeFilterTree: sinon.spy()
      });
      merge = Node.__get__('merge');
    });

    after(() => {
      rewireRevert();
    });

    it('should call the mergeIndexCache function when an `ic` key is given', () => {
      merge({ic: true});

      should(Node.__get__('mergeIndexCache')).be.calledOnce();
      should(Node.__get__('mergeIndexCache')).be.calledWith(true);
    });

    it('should call the mergeAddRoom function when an `hcR` key is given', () => {
      merge([{hcR: true}]);

      should(Node.__get__('mergeAddRoom')).be.calledOnce();
      should(Node.__get__('mergeAddRoom')).be.calledWith(true);
    });

    it('should call the mergeDelRoom function when an `hcDel` key is given', () => {
      merge({hcDel: true});

      should(Node.__get__('mergeDelRoom')).be.calledOnce();
      should(Node.__get__('mergeDelRoom')).be.calledWith(true);
    });
    
    it('should call the mergeDelRooms function when an `hcDelMul` key is given', () => {
      merge({hcDelMul: true});
      
      should(Node.__get__('mergeDelRooms')).be.calledOnce();
      should(Node.__get__('mergeDelRooms')).be.calledWith(true);
    });

    it('should call the mergeFilterTree function when an `ft`key is given', () => {
      merge({ft: true});

      should(Node.__get__('mergeFilterTree')).be.calledOnce();
      should(Node.__get__('mergeFilterTree')).be.calledWith(true);
    });

  });

  describe('#mergeIndexCache', () => {
    var
      mergeIndexCache = Node.__get__('mergeIndexCache');

    it('should do nothing if the diff is malformed', () => {
      mergeIndexCache.call(node, { invalid: 'format' });

      should(node.kuzzle.indexCache.add).have.callCount(0);
      should(node.kuzzle.indexCache.remove).have.callCount(0);
    });

    it('should handle additions', () => {
      mergeIndexCache.call(node, {
        '+': [
          { i: 'index', c: 'collection' },
          { i: 'anotherindex' }
        ]
      });

      should(node.kuzzle.indexCache.add).be.calledTwice();
      should(node.kuzzle.indexCache.add.firstCall).be.calledWith('index', 'collection');
      should(node.kuzzle.indexCache.add.secondCall).be.calledWith('anotherindex', undefined);
      should(node.kuzzle.indexCache.remove).have.callCount(0);
    });

    it('should handle deletions', () => {
      mergeIndexCache.call(node, {
        '-': [
          { i: 'index', c: 'collection' },
          { i: 'anotherindex' }
        ]
      });

      should(node.kuzzle.indexCache.add).have.callCount(0);
      should(node.kuzzle.indexCache.remove).be.calledTwice();
      should(node.kuzzle.indexCache.remove.firstCall).be.calledWith('index', 'collection');
      should(node.kuzzle.indexCache.remove.secondCall).be.calledWith('anotherindex', undefined);
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

});
