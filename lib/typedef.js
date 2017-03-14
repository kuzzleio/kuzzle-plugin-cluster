/**
 * @typedef {{
 *   pluginsManager: {
 *     trigger: function,
 *     isInit: boolean
 *   },
 *   services: {
 *     list: {
 *       proxyBroker: ProxyBroker
 *     }
 *   },
 *   config: {
 *     services: {
 *       internalBroker: {
 *         port: number
 *       }
 *     }
 *   },
 *   repositories: {
 *     profile: {
 *       profiles: object.<string, object>
 *     },
 *     role: {
 *       roles: object.<string, object>
 *     }
 *   }
 * }} Kuzzle
 */

/**
 * @typedef {{
 *   accessors: {
 *     kuzzle: Kuzzle
 *   },
 *   constructors: {
 *     services: {
 *       WsBrokerClient: function
 *     }
 *   }
 * }} PluginContext
 */

/**
 * @typedef {{
 *   handlers: Object.<string, Array.<function>>,
 *   send: function,
 *   listen: function
 * }} ProxyBroker
 */