version: "2"

services:
  kuzzle4:
    image: ${KUZ_IMAGE}
    container_name: kuzzle4
    command: bash /scripts/debug.sh
    networks:
      - kuzzle-cluster
    volumes:
      ${KUZ_VOLUME}
      - "./tmp/kuzzle4/node_modules:/var/app/node_modules"
      - "./scripts:/scripts"
      - "./config:/config"
      - "..:/var/kuzzle-plugin-cluster"
    environment:
      - MQ_BROKER_ENABLED=1
      - FEATURE_COVERAGE
      - kuzzle_cluster__retryInterval=2000
      - kuzzle_pluginsManager__defaultPlugins__kuzzle-plugin-cluster__path=/var/kuzzle-plugin-cluster
      - kuzzle_pluginsManager__defaultPlugins__kuzzle-plugin-cluster__activated=true
      - kuzzle_pluginsManager__defaultPlugins__kuzzle-plugin-cluster__privileged=true

  kuzzle5:
    image: ${KUZ_IMAGE}
    container_name: kuzzle5
    command: bash /scripts/debug.sh
    networks:
      - kuzzle-cluster
    volumes:
      ${KUZ_VOLUME}
      - "./tmp/kuzzle5/node_modules:/var/app/node_modules"
      - "./scripts:/scripts"
      - "./config:/config"
      - "..:/var/kuzzle-plugin-cluster"
    environment:
      - MQ_BROKER_ENABLED=1
      - FEATURE_COVERAGE
      - kuzzle_cluster__retryInterval=2000
      - kuzzle_pluginsManager__defaultPlugins__kuzzle-plugin-cluster__path=/var/kuzzle-plugin-cluster
      - kuzzle_pluginsManager__defaultPlugins__kuzzle-plugin-cluster__activated=true
      - kuzzle_pluginsManager__defaultPlugins__kuzzle-plugin-cluster__privileged=true

networks:
  kuzzle-cluster:
    driver: bridge
