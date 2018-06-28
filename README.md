[![Build Status](https://travis-ci.org/kuzzleio/kuzzle-plugin-cluster.svg?branch=master)](https://travis-ci.org/kuzzleio/kuzzle-plugin-cluster) [![codecov.io](http://codecov.io/github/kuzzleio/kuzzle-plugin-cluster/coverage.svg?branch=master)](http://codecov.io/github/kuzzleio/kuzzle-plugin-cluster?branch=master)

# Cluster mode plugin

This plugin adds a cluster mode to Kuzzle.

## Compatibility

Kuzzle: >=1.3.0 (commit ee04f8e)

## Try it

To run a kuzzle stack, you can use the provided compose file:

```bash
docker-compose up --scale kuzzle=3
```

NB: This compose stack is for tests only and should not be used as-is on production.  
Notably, only kuzzle runs in cluster mode, elasticsearch and redis are using one node only.

## Run a development stack

The development stack mounts both kuzzle and the cluster sources as docker volumes.

```bash
cd <dir>
git clone -b <commit> git@github.com:kuzzleio/kuzzle.git
git clone git@github.com:kuzzleio/kuzzle-plugin-cluster.git

cd kuzzle-plugin-cluster
cp docker-compose/my.env.sample docker-compose/my.env
vim docker-compose/my.env

./dev-npm-install.sh
./dev.sh
```

You should now have a full Kuzzle clustered stack running 3 Kuzzle front nodes (and 3 servers).
Each update on either Kuzzle or the cluster source should automatically restart kuzzle.

### nginx vs haproxy

The development stack exposes 2 reverse proxies:

* nginx on port 7512
* haproxy on port 7513

haproxy configuration includes some more advanced health checks, which are only partly available in the commercial version of nginx.
In counterpart, nginx currently offers a big advantage over haproxy in being able to hot reload its configuration without killing current connections.

In other words, when adding a node to the cluster, haproxy (at least up to current version 1.7) will disconnect all clients, while nginx won't.

### Goodies

* [http://localhost:7575/hastats] (kuzzle/kuzzle) => haproxy stats page
* [http://localhost:7512/_plugin/cluster/status] => cluster status
* `curl -XPOST http://localhost:7512/_plugin/cluster/reset` => resets redis state and force a new sync (blanks cluster state)
* [http://localhost:7512/cluster_kuzzle_1/] prefixing the url by the container name lets you access it directly

## Configuration

### Privileged context

This plugin needs privileged context to work. This context is granted by Kuzzle via the global configuration. Add the following to your configuration

```javascript
plugins: {
    'cluster': {
        privileged: true
    }
}
```

For more information on how to configure Kuzzle, [please refer to the Guide](http://docs.kuzzle.io/guide/#configuring-kuzzle).

### Pipe plugin timeouts

This plugin registers some pipe plugins which induce some delay and will exceed default Kuzzle timeouts. 
Make sure you increase your pipe timeouts accordingly.

```json
  "plugins": {
    "common": {
      "pipeWarnTime": 5000,
      "pipeTimeout": 10000
    }
```

### Redis cluster

Redis cluster comes with some limitations:

1. Single database only.
2. Cluster node arrays.

The latter implies the configuration cannot be set via environment variables.
To comply with the former, make sure to set only one database index (0).

i.e.:
```json
    "internalCache": {
      "database": 0,
      "nodes": [
        {
          "host": "cluster_redis_1",
          "port": 6379
        },
        {
          "host": "cluster_redis_2",
          "port": 6379
        },
        {
          "host": "cluster_redis_3",
          "port": 6379
        }
      ]
    },
    "memoryStorage": {
      "database": 0,
      "nodes": [
        {
          "host": "cluster_redis_1",
          "port": 6379
        },
        {
          "host": "cluster_redis_2",
          "port": 6379
        },
        {
          "host": "cluster_redis_3",
          "port": 6379
        }
      ]
    }
```


