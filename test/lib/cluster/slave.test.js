var
  should = require('should'),
  Slave = require('../../../lib/cluster/slave');

describe('cluster/slave', () => {

  describe('#_constructor', () => {

    it('does not do much for the time being', () => {
      var
        context = {foo: 'bar'},
        options = { binding: '172.17.0.45:9511' },
        slave = new Slave(context, options);

      should(slave.binding).be.exactly(options.binding);
    });

  });

});
