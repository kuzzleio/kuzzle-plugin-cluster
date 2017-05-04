'use strict';

const
  debug = require('../kuzzleDebug')('kuzzle:cluster:node:slave'),
  Node = require('./node');

/**
 * @class SlaveNode
 */
class SlaveNode extends Node {
  /**
   * @param {KuzzleCluster} cluster
   * @param {PluginContext} context
   * @param {object} options
   * @constructor
   */
  constructor (cluster, context, options) {
    super(cluster, context, options);
  }

  init () {
    debug('initialize connection to master internal broker');

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
    debug('detach slave node');

    super.detach();

    // remove handlers
    if (this.broker) {
      this.broker.onConnectHandlers = [];
      this.broker.onCloseHandlers = [];
      this.broker.onErrorHandlers = [];

      // @hack remove ping timers
      // @todo: fix this on kuzzle side & remove this part once done
      if (this.broker.client && this.broker.client.socket) {
        this.broker.client.socket.removeAllListeners('pong');
      }

      if (this.broker._pingRequestIntervalId) {
        clearTimeout(this.broker._pingRequestIntervalId);
        this.broker._pingRequestIntervalId = null;
      }

      if (this.broker._pingRequestTimeoutId) {
        clearTimeout(this.broker._pingRequestTimeoutId);
        this.broker._pingRequestTimeoutId = null;
      }
      // - @hack

      this.broker.reconnect = false;
      this.broker.close();

      this.broker = null;
    }
  }

  attachEvents () {
    debug('initialize cluster listeners');

    // common events
    this.addDiffListener();

    // we setup a private communication channel
    this.broker.listen(`cluster:${this.clusterHandler.uuid}`, msg => {
      debug('private message received: %a', msg);

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

    this.broker.onCloseHandlers.push(this.detach.bind(this));

    // error on cluster ws socket - disconnect from the lb and detach from the cluster
    // The ws client will automatically retry to connect
    this.broker.onErrorHandlers.push(error => {
      const err = new Error(error && error.message || '');

      if (this.kuzzle.services.list.proxyBroker.client.socket) {
        this.kuzzle.services.list.proxyBroker.client.socket.emit('error', err);
      }
      this.detach();
    });
  }

  join () {
    let nodeInfo = {
      uuid: this.clusterHandler.uuid,
      options: this.options
    };

    if (this.broker) {
      debug('sending node informations to master node: %a', nodeInfo);

      this.broker.send('cluster:join', nodeInfo);
    }
    else {
      debug('unable to send node informations to master node, broker disconnected: %a', nodeInfo);
    }
  }

}

module.exports = SlaveNode;
