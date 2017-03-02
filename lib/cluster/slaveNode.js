'use strict';

const
  debug = require('debug')('kuzzle:cluster:node:slave'),
  util = require('util'),
  Node = require('./node');

class SlaveNode extends Node {
  /**
   *
   * @param {KuzzleCluster} cluster
   * @param {PluginContext} context
   * @param {Object} options
   */
  constructor (cluster, context, options) {
    super(cluster, context, options);
  }

  init () {
    debug('initialize connection to master internal broker')

    this.broker = new this.context.constructors.services.WsBrokerClient(
      'cluster',
      this.options,
      this.kuzzle.pluginsManager,
      true
    );

    return this.broker.init()
      .then(() => this.attachEvents());
  }

  detach () {
    debug('detach node from master internal broker')
    this.isReady = false;

    // remove handlers
    this.broker.onConnectHandlers = []
    this.broker.onCloseHandlers = []
    this.broker.onErrorHandlers = []

    // remove ping listeners
    if (this.broker.client && this.broker.client.socket) {
      this.broker.client.socket.removeAllListeners('pong');
    }

    if (this.broker._pingRequestIntervalId) {
      clearTimeout(this.broker._pingRequestIntervalId);
      bthis.roker._pingRequestIntervalId = null;
    }

    if (this.broker._pingRequestTimeoutId) {
      clearTimeout(this.broker._pingRequestTimeoutId);
      this.broker._pingRequestTimeoutId = null;
    }

    // force clean deconnection
    if (!this.broker.close()) {
      this.broker.client.state = 'disconnected'
    }

    this.broker = null;
  }

  attachEvents () {
    debug('initialize cluster listeners')

    // common events
    this.addDiffListener();

    // we setup a private communication channel
    this.broker.listen(`cluster:${this.clusterHandler.uuid}`, msg => {
      debug('private message received:\n%O', msg)

      switch (msg.action) {
        case 'snapshot':
          this.kuzzle.hotelClerk.rooms = msg.data.hc.r;
          this.kuzzle.hotelClerk.customers = msg.data.hc.c;

          msg.data.fs.forEach(f => {
            this.kuzzle.dsl.storage.store(f.idx, f.coll, f.f);
          });

          this.isReady = true;
          break;
      }
    });

    // we inform the master we are in and attach the action in case of reconnection
    this.broker.onConnectHandlers.push(this.join.bind(this));
    this.join();

    this.broker.onCloseHandlers.push(() => {
      debug('broker connection closed')
      this.isReady = false;
    });

    this.broker.onErrorHandlers.push(() => {
      debug('broker connection errored')
      this.isReady = false;
    });
  }

  join () {
    let nodeInfo = {
      uuid: this.clusterHandler.uuid,
      options: this.options
    };

    if (this.broker) {
      debug('sending node informations to master node:\n%O', nodeInfo)

      this.broker.send('cluster:join', nodeInfo);
    }
    else {
      debug('unable to send node informations to master node, broker disconnected:\n%O', nodeInfo)
    }
  }

}

module.exports = SlaveNode;
