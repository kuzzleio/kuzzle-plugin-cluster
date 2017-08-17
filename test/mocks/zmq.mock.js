const
  sinon = require('sinon');


exports.socket = sinon.spy(function () {
  return {
    bind: sinon.stub().yields(),
    close: sinon.spy(),
    connect: sinon.spy(),
    disconnect: sinon.spy(),
    on: sinon.spy(),
    subscribe: sinon.spy(),
    send: sinon.spy()
  };
});
