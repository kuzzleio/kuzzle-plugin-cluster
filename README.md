
# Cluster mode plugin

This plugin adds a cluster mode to Kuzzle.

## Compatiblity

see [Release description](https://github.com/kuzzleio/kuzzle-plugin-cluster/releases)

## How to set it up

```bash
cd <dir>
git clone -b <commit> git@github.com:kuzzleio/kuzzle.git
git clone git@github.com:kuzzleio/kuzzle-plugin-cluster.git

cd kuzzle-plugin-cluster
cp docker-compose/my.env.sample docker-compose/my.env
vim docker-compose/my.env

./run-npm-install.sh
./run.sh
```

You should now have a full Kuzzle clustered stack running 3 Kuzzle front nodes (and 3 servers).

## Goodies

* [http://localhost:7575/hastats] (kuzzle/kuzzle) => haproxy stats page
* [http://localhost:7512/_plugin/cluster/status] => cluster status
* `curl -XPOST http://localhost:7512/_plugin/cluster/reset` => resets redis state and force a new sync (blanks cluster state)
* [http://localhost:7512/cluster_kuzzle_1/] prefixing the url by the container name lets you access it directly

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

## Known bugs

* Monkey tests fail after a couple of minutes on validation the subscriptions counts, most likely due to the cluster state propagation time (to be investigated).


