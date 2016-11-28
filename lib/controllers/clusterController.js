var Promise = require('bluebird');

module.exports = function ClusterController (context, cluster) {
  this.getClusterStatus = function kuzzlePluginClusterGetClusterStatus (requestObject) {
    return Promise.resolve({
      responseObject: new context.constructors.ResponseObject(requestObject, cluster.node.clusterStatus)
    });
  };
};
