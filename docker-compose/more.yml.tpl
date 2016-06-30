version: "2"

services:
  kuzzle_slave3:
    image: ${KUZ_IMAGE}
    container_name: kuzzle_slave3
    command: bash /scripts/debug.sh
    networks:
      - kuzzle-cluster
    volumes:
      ${KUZ_VOLUMES}
      - "./tmp/slave3/node_modules:/var/app/node_modules"
      - "./scripts:/scripts"
      - "./config:/config"
      - "..:/var/kuzzle-plugin-cluster"
    environment:
      - MQ_BROKER_ENABLED=1
      - FEATURE_COVERAGE
      - kuzzle_cluster__mode=slave
      - kuzzle_cluster__host=master
      - kuzzle_cluster__port=7911
      - kuzzle_cluster__clusterName=kuzzle-cluster
      - kuzzle_cluster__retryInterval=2000
      - kuzzle_pluginsManager__defaultPlugins__kuzzle-plugin-cluster__path=/var/kuzzle-plugin-cluster
      - kuzzle_pluginsManager__defaultPlugins__kuzzle-plugin-cluster__activated=true
      - kuzzle_pluginsManager__defaultPlugins__kuzzle-plugin-cluster__privileged=true

  kuzzle_slave4:
    image: ${KUZ_IMAGE}
    container_name: kuzzle_slave4
    command: bash /scripts/debug.sh
    networks:
      - kuzzle-cluster
    volumes:
      ${KUZ_VOLUMES}
      - "./tmp/slave4/node_modules:/var/app/node_modules"
      - "./scripts:/scripts"
      - "./config:/config"
      - "..:/var/kuzzle-plugin-cluster"
    environment:
      - MQ_BROKER_ENABLED=1
      - FEATURE_COVERAGE
      - kuzzle_cluster__mode=slave
      - kuzzle_cluster__host=master
      - kuzzle_cluster__port=7911
      - kuzzle_cluster__clusterName=kuzzle-cluster
      - kuzzle_cluster__retryInterval=2000
      - kuzzle_pluginsManager__defaultPlugins__kuzzle-plugin-cluster__path=/var/kuzzle-plugin-cluster
      - kuzzle_pluginsManager__defaultPlugins__kuzzle-plugin-cluster__activated=true
      - kuzzle_pluginsManager__defaultPlugins__kuzzle-plugin-cluster__privileged=true

networks:
  kuzzle-cluster:
    driver: bridge
