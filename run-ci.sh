#!/bin/sh

set -e

docker-compose -f "docker-compose/docker-compose-ci.yml" up -d
sleep 120
docker exec -ti dockercompose_kuzzle1_1 /bin/sh -c '/scripts/run-test.sh'
