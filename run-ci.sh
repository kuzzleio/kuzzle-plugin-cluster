#!/bin/sh

set -e

docker-compose -f "docker-compose/docker-compose-ci.yml" run kuzzle
