#!/bin/sh

set -eu

ES=0

# kill containers for debug usage
docker-compose -f "docker-compose/docker-compose-ci.yml" kill

# clean containers and pull images, concourse keep images and containers in cache
docker-compose -f "docker-compose/docker-compose-ci.yml" rm -vf
docker-compose -f "docker-compose/docker-compose-ci.yml" pull

# start cluster
docker-compose -f "docker-compose/docker-compose-ci.yml" up -d

echo "Sleeping 90"
sleep 90

docker exec kuzzle1 chmod u+x /var/app/docker-compose/scripts/run-test.sh

if ! (docker exec -ti kuzzle1 /bin/sh -c '/var/app/docker-compose/scripts/run-test.sh'); then
    docker-compose -f "docker-compose/docker-compose-ci.yml" logs loadbalancer kuzzle1 kuzzle2 kuzzle3
    ES=1
fi

# kill containers for debug usage
docker-compose -f "docker-compose/docker-compose-ci.yml" kill

exit $ES
