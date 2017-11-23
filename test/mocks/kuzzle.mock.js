const
  sinon = require('sinon');

class KuzzleMock {
  constructor () {
    this.config = {
      services: {
        internalCache: {
          node: {
            host: 'redis'
          }
        }
      }
    };

    this.dsl = {
      storage: {
        filtersIndex: {},
        filters: {},
        store: sinon.spy()
      }
    };

    this.funnel = {
      controllers: {
        realtime: { }
      }
    };

    this.hotelClerk = {
      customers: {},
      rooms: {},
      _removeRoomEverywhere: sinon.spy()
    };

    this.indexCache = {
      add: sinon.spy(),
      remove: sinon.spy(),
      reset: sinon.spy()
    };

    this.notifier = {
      _dispatch: sinon.spy()
    };

    this.pluginsManager = {
      registerStrategy: sinon.spy(),
      strategies: {},
      unregisterStrategy: sinon.spy()
    };

    this.realtime = {
      storage: {}
    };

    this.repositories = {
      profile: {
        profiles: {}
      },
      role: {
        roles: {}
      }
    };

    this.services = {
      list: {
        storageEngine: {
          setAutoRefresh: sinon.spy(),
          settings: {
            autoRefresh: {}
          }
        }
      }
    };

    this.validation = {
      curateSpecification: sinon.spy()
    };

  }
}

module.exports = KuzzleMock;
