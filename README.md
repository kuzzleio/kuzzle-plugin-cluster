
# Cluster mode plugin

This plugin adds a cluster mode to Kuzzle.

## How to set it up

At the time this document is written, this plugin is working using the following dependencies:

* Kuzzle: >= [1.0.0-RC4 release](https://github.com/kuzzleio/kuzzle/tree/1.0.0-RC4)
* LB: branch [kuz-579-cluster-quarantine](https://github.com/kuzzleio/kuzzle-load-balancer/tree/kuz-579-cluster-quarantine)

```bash
cd <dir>
git pull -b 1.0.0-RC4 git@github.com:kuzzleio/kuzzle.git
git pull -b kuz-579-cluster-quarantine git@github.com:kuzzleio/kuzzle-load-balancer.git
git pull git@github.com:kuzzleio/kuzzle-plugin-cluster.git

cd kuzzle-plugin-cluster
cp docker-compose/my.env.sample docker-compose/my.env
vim docker-compose/my.env

./run-debug.sh
```

You should now have a full Kuzzle clustered stack running 3 Kuzzle front nodes (and 3 servers).

## Known bugs

* MQ-based functional tests fail


