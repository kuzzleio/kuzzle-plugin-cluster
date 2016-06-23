#!/usr/bin/env bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR/docker-compose"

_help() {
    echo "Edit my.env and run me again"
}


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
    export LB_IMAGE=${LB_IMAGE:-kuzzleio/proxy}
    export LB_VOLUMES="[]"
    if [ "$LB_PATH" != "" ]; then
        export LB_VOLUMES="- \"$(readlink -f ${LB_PATH}):/var/app\""
    fi

    # kuzzle
    export KUZ_IMAGE=${KUZ_IMAGE:-kuzzleio/dev:alpine}
    export KUZ_VOLUMES=""
    if [ "$KUZ_PATH" != "" ]; then
        export KUZ_VOLUMES="- \"$(readlink -f ${KUZ_PATH}):/var/app\""
    fi

    envsubst < docker-compose.yml.tpl > docker-compose.yml
)
docker-compose up



