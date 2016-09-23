#!/bin/sh

set -e

docker-compose -f "docker-compose/docker-compose-ci.yml" up -d

echo "Sleeping 120"
sleep 120

docker exec kuzzle1 chmod u+x /scripts/run-test.sh
docker exec -ti kuzzle1 /bin/sh -c '/scripts/run-test.sh'
