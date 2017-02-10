var Promise = require('bluebird');

module.exports = function ClusterController (context, cluster) {
  this.getClusterStatus = function kuzzlePluginClusterGetClusterStatus () {
    return Promise.resolve(cluster.node.clusterStatus);
  };
};
