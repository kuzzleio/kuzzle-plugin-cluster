#!/bin/sh

set -e

docker-compose -f "docker-compose/docker-compose-ci.yml" up -d

echo "Sleeping 120"
sleep 120
cat /tmp/logs.log
docker exec kuzzle1 chmod u+x /scripts/run-test.sh
docker exec -ti kuzzle1 /bin/sh -c '/scripts/run-test.sh'
docker-compose -f "docker-compose/docker-compose-ci.yml" logs loadbalancer kuzzle1 kuzzle2 kuzzle3


