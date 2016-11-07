var Promise = require('bluebird');

module.exports = function ClusterController (context, cluster) {
  this.getClusterStatus = function (requestObject) {
    return Promise.resolve(new context.constructors.ResponseObject(requestObject, cluster.node.clusterStatus));
  };
};
