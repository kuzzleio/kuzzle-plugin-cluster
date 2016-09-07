#!/bin/sh

set -e

docker-compose -f "docker-compose/docker-compose-ci.yml" up -d

sleep 60

docker exec -ti kuzzle1 chmod u+x /scripts/run-kuzzle.sh
docker exec -ti kuzzle1 chmod u+x /scripts/run-test.sh
docker exec -ti kuzzle2 chmod u+x /scripts/run-kuzzle.sh
docker exec -ti kuzzle3 chmod u+x /scripts/run-kuzzle.sh

docker exec -ti kuzzle1 chmod u+x /bin/sh -c '/scripts/run-kuzzle.sh'
docker exec -ti kuzzle2 chmod u+x /bin/sh -c '/scripts/run-kuzzle.sh'
docker exec -ti kuzzle3 chmod u+x /bin/sh -c '/scripts/run-kuzzle.sh'

sleep 120

docker exec -ti kuzzle1 /bin/sh -c '/scripts/run-test.sh'
