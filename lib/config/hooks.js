module.exports = {
  'core:kuzzleStart': 'kuzzleStarted',
  'subscription:beforeRemoveRooms': 'roomsRemoved',
  'data:afterCreateIndex': 'indexCreated',
  'data:afterDeleteIndex': 'indexDeleted',
  'data:afterDeleteIndexes': 'indiciesDeleted',
  'data:afterUpdateMapping': 'mappingUpdated',
  'subscription:coreAdd': 'subscriptionAdded',
  'subscription:coreJoin': 'subscriptionJoined',
  'subscription:coreRemoveRoom': 'subscriptionOff'
};
