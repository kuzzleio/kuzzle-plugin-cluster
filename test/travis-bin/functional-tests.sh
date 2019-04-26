#!/bin/bash

set -e

docker pull kuzzleio/kuzzle

# git clone kuzzle
cd /tmp/
git clone --recursive -b 1-dev https://github.com/kuzzleio/kuzzle.git

cd "$TRAVIS_BUILD_DIR"
echo "KUZ_PATH=/tmp/kuzzle" > docker-compose/my.env

./dev-npm-install.sh

./dev.sh > /dev/null 2>&1 &

echo "waiting for kuzzle"
timeout 600 bash -c 'until curl -f -s -o /dev/null http://localhost:7512/_plugin/cluster/health; do echo -n ".";sleep 1; done'

docker-compose -p cluster \
  -f docker-compose/docker-compose.yml \
  exec kuzzle ./node_modules/.bin/cucumber-js -p websocketNoRedis

