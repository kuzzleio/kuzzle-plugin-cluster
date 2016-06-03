var
  os = require('os'),
  InternalError = require('kuzzle-common-objects').Errors.internalError,
  _context;

function Slave (context, options) {
  _context = context;

  this.binding = resolveBinding.call(this, options.binding);

}

module.exports = Slave;

function resolveBinding (config) {
  var
    host = config,
    port = _context.kuzzle.config.internalBroker.port,
    match,
    iface,
    family,
    tmp;

  // anything:#### case test
  match = /^\(.*?)(?::(\d+))?/.exec(config);

  if (match) {
    if (match[2]) {
      port = match[2];
    }
    host = match[1];

    // [eth0:ipv4] case test
    match = /^\[(.*?):(.*?)\]/.exec(host);

    if (match) {
      iface = match[1];
      family = match[2].toLowerCase();

      if (os.getNetworkInterfaces()[iface]) {
        tmp = os.getNetworkInterfaces()[iface].filter(def => family === def.family.toLowerCase());

        if (tmp.length) {
          host = tmp[0].address;
        }
        else {
          throw new InternalError(`Invalid ip family provided [${family}] for network interface ${iface}`);
        }
      }
      else {
        throw new InternalError(`Invalid network interface provided [${iface}]`);
      }
    }
  }

  return host + ':' + port;
}
