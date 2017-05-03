const debug = require('debug');
const util = require('util');

debug.formatters.a = value => {
  const inspectOpts = debug.inspectOpts;

  if (inspectOpts.expand) {
    return '\n' + util.inspect(value, inspectOpts);
  }

  return util.inspect(value, inspectOpts).replace(/\s*\n\s*/g, ' ');
};

module.exports = debug;
