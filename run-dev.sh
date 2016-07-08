#!/usr/bin/env bash

COMPOSE_FILE=docker-compose.yml

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR/docker-compose"

_help() {
    echo "Edit my.env and run me again"
}

_exit() {
    docker-compose -f "$COMPOSE_FILE" stop
}

trap _exit SIGINT SIGTERM

while [ $# -gt 0 ]; do
    key="$1"

    case $key in
        -h|--help)
            _help
            exit 0
        ;;
        setup|install)
            _setup
            exit 0
        ;;
    esac
done

if [ ! -f ./my.env ]; then
    _help
    exit 0
fi

# main
(
    . ./my.env

    # lb
    export LB_IMAGE=${LB_IMAGE:-kuzzleio/proxy-dev}
    export LB_VOLUME="[]"
    if [ "$LB_PATH" != "" ]; then
        export LB_VOLUME="- \"$(readlink -f ${LB_PATH}):/var/app\""
    fi

    # kuzzle
    export KUZ_IMAGE=${KUZ_IMAGE:-kuzzleio/dev:alpine}
    export KUZ_VOLUME=""
    if [ "$KUZ_PATH" != "" ]; then
        export KUZ_VOLUME="- \"$(readlink -f ${KUZ_PATH}):/var/app\""
    fi
    export KUZ_LB_VOLUME="- \"$(readlink -f ${LB_PATH}):/var/kuzzle-load-balancer\""

    envsubst < docker-compose.yml.tpl > docker-compose.yml
)
docker-compose -f "$COMPOSE_FILE" stop
docker-compose -f "$COMPOSE_FILE" rm -fva 2> /dev/null
docker-compose -f "$COMPOSE_FILE" up -d
docker-compose -f "$COMPOSE_FILE" logs -f loadbalancer kuzzle1 kuzzle2 kuzzle3




