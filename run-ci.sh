#!/bin/sh

set -e

COMPOSE_FILE=docker-compose.yml

DIR="$( cd "$( dirname "$0" )" && pwd )"
cd "$DIR/docker-compose"

. ./my.env

envsubst < docker-compose.yml.tpl > docker-compose.yml

docker-compose -f "$COMPOSE_FILE" run kuzzle
