#!/bin/sh

set -eu

docker-compose -f "docker-compose/docker-compose-ci.yml" up -d

echo "Sleeping 120"
sleep 120

docker exec kuzzle1 chmod u+x /scripts/run-test.sh
echo "Launch the tests...."
trap "docker exec -ti kuzzle1 /bin/sh -c '/scripts/run-test.sh'" EXIT
echo "Docker Compose logs:"
echo "Sleeping 360"
sleep 360
docker-compose -f "docker-compose/docker-compose-ci.yml" logs loadbalancer kuzzle1 kuzzle2 kuzzle3


