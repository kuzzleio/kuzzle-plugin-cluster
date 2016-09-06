#!/bin/sh

set -e

docker-compose -f "docker-compose/docker-compose-ci.yml" up -d
sleep 120
docker exec -ti kuzzle1 /bin/sh -c '/var/app/scripts/run-test.sh'
