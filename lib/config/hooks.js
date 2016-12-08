module.exports = {
  'core:kuzzleStart': 'kuzzleStarted',
  'subscribe:beforeRemoveRooms': 'roomsRemoved',
  'core:indexCache:add': 'indexCacheAdded',
  'core:indexCache:remove': 'indexCacheRemoved',
  'core:indexCache:reset': 'indexCacheResett',
  'core:hotelClerk:addSubscription': 'subscriptionAdded',
  'core:hotelClerk:removeRoomForCustomer': 'subscriptionOff',
  'core:hotelClerk:join': 'subscriptionJoined',
  'admin:beforeSetAutoRefresh': 'autoRefreshUpdated',
  'admin:afterUpdateSpecifications' : 'refreshSpecifications',
  'admin:afterDeleteSpecifications' : 'refreshSpecifications'
};
