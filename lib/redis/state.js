class State {
  constructor (raw) {
    this.version = raw[0] && parseInt(raw[0]) || 1;

    this.rooms = [];
    for (const v of raw[1]) {
      this.rooms.push({
        id: v[0],
        filter: v[1] && JSON.parse(v[1]),
        count: parseInt(v[2])
      });
    }
  }

  static current (redis, index, collection) {
    return redis.clusterState(`{${index}/${collection}}`)
      .then(raw => new State(raw));
  }
}

module.exports = State;
