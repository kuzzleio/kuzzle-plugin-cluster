module.exports = {
  'proxyBroker:connected': 'kuzzleStarted',
  'core:indexCache:add': 'indexCacheAdded',
  'core:indexCache:remove': 'indexCacheRemoved',
  'core:indexCache:reset': 'indexCacheResett',
  'core:hotelClerk:addSubscription': 'subscriptionAdded',
  'core:hotelClerk:removeRoomForCustomer': 'subscriptionOff',
  'core:hotelClerk:join': 'subscriptionJoined',
  'index:beforeSetAutoRefresh': 'autoRefreshUpdated',
  'collection:afterUpdateSpecifications' : 'refreshSpecifications',
  'collection:afterDeleteSpecifications' : 'refreshSpecifications'
};
