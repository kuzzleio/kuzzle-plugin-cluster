
# Cluster mode plugin

This plugin adds a cluster mode to Kuzzle.

## Compatiblity

The 1.1.x version of this plugin are compatible with the next-coming stable Kuzzle v1 branch.

### Current development commits:

* [kuzzle#5c40c61](https://github.com/kuzzleio/kuzzle/commits/5c40c61)
* [kuzzle-proxy#7410364](https://github.com/kuzzleio/kuzzle-proxy/7410364)
* [kuzzle-load-balancer#d88bb2e](https://github.com/kuzzleio/kuzzle-load-balancer/d88bb2e)

## How to set it up

Step 1: Edit docker-compose/my.env file (cf docker-compose/my.env.sample), then:

```bash
cd <dir>
git clone -b <commit> git@github.com:kuzzleio/kuzzle.git
# optional:
git clone -b <commit> git@github.com:kuzzleio/kuzzle-proxy.git
git clone -b <commit> git@github.com:kuzzleio/kuzzle-load-balancer.git
git clone git@github.com:kuzzleio/kuzzle-plugin-cluster.git

cd kuzzle-plugin-cluster
cp docker-compose/my.env.sample docker-compose/my.env
vim docker-compose/my.env

./run-npm-install.sh
./run.sh
```

You should now have a full Kuzzle clustered stack running 3 Kuzzle front nodes (and 3 servers).

### Privileged context

This plugin needs privileged context to work. This context is granted by Kuzzle via the global configuration. Add the following to your configuration

```javascript
plugins: {
    'kuzzle-plugin-cluster': {
        privileged: true
    }
}
```

For more information on how to configure Kuzzle, [please refer to the Guide](http://docs.kuzzle.io/guide/#configuring-kuzzle).

## Known bugs

* Monkey tests fail after a couple of minutes on validation the subscriptions counts, most likely due to the cluster state propagation time (to be investigated).


