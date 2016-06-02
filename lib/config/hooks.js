module.exports = {
  'subscription:beforeRemoveRooms': 'roomsRemoved',
  'data:afterCreateIndex': 'indexCreated',
  'data:afterDeleteIndex': 'indexDeleted',
  'data:afterDeleteIndexes': 'indiciesDeleted',
  'data:afterUpdateMapping': 'mappingUpdated',
  'subscription:coreAdd': 'subscriptionAdded',
  'subscription:coreJoin': 'subscriptionJoined',
  'subscription:beforeOff': 'subscriptionOff'
};
