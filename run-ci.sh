#!/bin/sh

set -eu

docker-compose -f "docker-compose/docker-compose-ci.yml" up -d

echo "Sleeping 120"
sleep 120

docker exec kuzzle1 chmod u+x /scripts/run-test.sh

trap "docker exec -ti kuzzle1 /bin/sh -c '/scripts/run-test.sh'" EXIT

echo "Sleeping 360"
sleep 360

