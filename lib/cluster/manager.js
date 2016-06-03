var
  uuid = require('node-uuid'),
  MasterNode = require('./masterNode'),
  SlaveNode = require('./slavea'),
  _kuzzle;

function ClusterHandler (context, options) {
  this.options = options;
  this.context = context;
  _kuzzle = context.kuzzle;

  this.uuid = uuid.v1();
  context.uuid = this.uuid;

  this.node = options.mode === 'master'
    ? new MasterNode(this, context, options)
    : new SlaveNode(this, context, options);

}

ClusterHandler.prototype.init = function () {
  return this.node.init();
};


module.exports = ClusterHandler;


