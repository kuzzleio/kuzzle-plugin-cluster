'use strict';

const
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
    console.log('SlaveNode init')
    this.broker = new this.context.constructors.services.WsBrokerClient(
      'cluster',
      this.options,
      this.kuzzle.pluginsManager,
      true
    );

    return this.broker.init()
      .then(() => this.attachEvents.bind(this));
  }

  detach () {
    super()

    this.broker.close();
  }

  attachEvents () {
    console.log('SlaveNode attachEvents')
    // common events
    this.addDiffListener();

    // we setup a private communication channel
    this.broker.listen(`cluster:${this.clusterHandler.uuid}`, response => {
      switch (response.action) {
        case 'snapshot':
          this.kuzzle.hotelClerk.rooms = response.data.hc.r;
          this.kuzzle.hotelClerk.customers = response.data.hc.c;

          response.data.fs.forEach(f => {
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
      this.isReady = false;
    });

    this.broker.onErrorHandlers.push(() => {
      this.isReady = false;
    });
  }

  join () {
    this.broker.send('cluster:join', {
      uuid: this.clusterHandler.uuid,
      options: this.options
    });
  }

}

module.exports = SlaveNode;
