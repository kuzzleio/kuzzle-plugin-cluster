#!/bin/sh

set -e

docker-compose -f "docker-compose/docker-compose-ci.yml" up -d

sleep 60

docker exec kuzzle1 chmod u+x /scripts/run-kuzzle.sh
docker exec kuzzle1 chmod u+x /scripts/run-test.sh
docker exec kuzzle2 chmod u+x /scripts/run-kuzzle.sh
docker exec kuzzle3 chmod u+x /scripts/run-kuzzle.sh

docker exec -t kuzzle1 /bin/sh -c '/scripts/run-kuzzle.sh' > /dev/null &
docker exec -t kuzzle2 /bin/sh -c '/scripts/run-kuzzle.sh' > /dev/null &
docker exec -t kuzzle3 /bin/sh -c '/scripts/run-kuzzle.sh' > /dev/null &

sleep 120

docker exec -ti kuzzle1 /bin/sh -c '/scripts/run-test.sh'
