
function Node () { }

Node.prototype.addDiffListener = function () {
  this.broker.listen('cluster:update', diffs => {
    if (!Array.isArray(diffs)) {
      diffs = [diffs];
    }

    diffs.forEach(diff => {
      switch (Object.keys(diff)[0]) {
        case 'ic':
          // IndexCache
          if (diff.ic['+']) {
            diff.ic['+'].forEach(o => {
              this.kuzzle.indexCache.add(o.i, o.c);
            });
          }
          if (diff.ic['-']) {
            diff.ic['-'].forEach(o => {
              this.kuzzle.indexCache.remove(o.i, o.c);
            });
          }
          break;
        case 'hcR':
          // hotelClerck rooms added or subscribed to
          this.kuzzle.hotelClerck.addRoomForCustomer(diff.hcR.c, diff.hcR.r, diff.hcR.m);
          break;
        case 'hcDel':
          // hotelClerck rooms unsubscribed
          this.kuzzle.hotelClerck.removeRoomForCustomer(diff.hcDel.c, diff.hcDel.r, false);
          break;
        case 'ft':
          // Filter tree
          this.kuzzle.dsl.addToFiltersTree(
            diff.ft.i,
            diff.ft.c,
            diff.ft.f,
            diff.ft.o,
            diff.ft.v,
            diff.ft.fn,
            diff.ft.r,
            diff.ft.n,
            diff.ft.g
          );
          break;
      }
    });

  });
};

module.exports = Node;
