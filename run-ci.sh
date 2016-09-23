#!/bin/sh

set -e

docker-compose -f "docker-compose/docker-compose-ci.yml" up -d
docker-compose -f "$COMPOSE_FILE" logs loadbalancer kuzzle1 kuzzle2 kuzzle3

sleep 120

docker exec kuzzle1 chmod u+x /scripts/run-test.sh
docker exec -ti kuzzle1 /bin/sh -c '/scripts/run-test.sh'
