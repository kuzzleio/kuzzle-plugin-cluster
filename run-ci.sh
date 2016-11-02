#!/bin/sh

set -eu

ES=0

docker-compose -f "docker-compose/docker-compose-ci.yml" rm -f
docker-compose -f "docker-compose/docker-compose-ci.yml" pull
docker-compose -f "docker-compose/docker-compose-ci.yml" up -d

echo "Sleeping 90"
sleep 90

docker exec kuzzle1 chmod u+x /scripts/run-test.sh

if ! (docker exec -ti kuzzle1 /bin/sh -c '/scripts/run-test.sh'); then
    docker-compose -f "docker-compose/docker-compose-ci.yml" logs dockercompose_elasticsearch_1 loadbalancer kuzzle1 kuzzle2 kuzzle3
    ES=1
fi

exit $ES