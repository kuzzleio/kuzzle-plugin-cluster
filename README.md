![logo](http://kuzzle.io/images/logoS.png)

# Cluster mode plugin

This plugin adds a cluster mode to Kuzzle.

## How to set it up

At the time this document is written, this plugin is working using the following dependencies:

* Kuzzle: branch [kuz-536-internal-state-update](https://github.com/kuzzleio/kuzzle/tree/kuz-536-internal-state-updates-hooks)
* Proxy: [commit 39976f6](https://github.com/kuzzleio/kuzzle-proxy/commit/39976f6f47f87456450ba80eadb93544461eb7df)

```bash
cd <dir>
git pull -b kuz-536-internal-state-update git@github.com:kuzzleio/kuzzle.git
git pull -b 39976f6f47f87456450ba80eadb93544461eb7df git@github.com:kuzzleio/kuzzle-proxy.git
git pull git@github.com:kuzzleio/kuzzle-plugin-cluster.git

cd kuzzle-plugin-cluster
cp docker-compose/my.env.sample docker-compose/my.env
vim docker-compose/my.env

./run-debug.sh
```

You should now have a full Kuzzle clustered stack running 3 Kuzzle front nodes (and 3 servers).

## Known bugs

* MQ-based functional tests fail


