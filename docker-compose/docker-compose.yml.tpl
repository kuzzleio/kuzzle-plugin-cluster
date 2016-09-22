version: "2"

services:
  loadbalancer:
    image: ${LB_IMAGE}
    container_name: kuzzle_lb
    networks:
      kuzzle-cluster:
        aliases:
          - api
    volumes:
      ${LB_VOLUME}
    ports:
      - "7511:7511"
      - "7512:7512"
      - "7513:7513"
    environment:
      - lb_backendMode=round-robin

  kuzzle1:
    image: ${KUZ_IMAGE}
    container_name: kuzzle1
    command: bash /scripts/debug.sh
    networks:
      - kuzzle-cluster
    volumes:
      ${KUZ_VOLUME}
      ${KUZ_LB_VOLUME}
      - "./tmp/kuzzle1/node_modules:/var/app/node_modules"
      - "./scripts:/scripts"
      - "./config:/config"
      - "..:/var/kuzzle-plugin-cluster"
    ports:
      - "8080:8080"
      - "8081:8081"
    environment:
      - MQ_BROKER_ENABLED=1
      - FEATURE_COVERAGE
      - kuzzle_cluster__retryInterval=2000
      - kuzzle_plugins__kuzzle-plugin-cluster__path=/var/kuzzle-plugin-cluster
      - kuzzle_plugins__kuzzle-plugin-cluster__activated=true
      - kuzzle_plugins__kuzzle-plugin-cluster__privileged=true

  kuzzle2:
    image: ${KUZ_IMAGE}
    container_name: kuzzle2
    command: bash /scripts/debug.sh
    networks:
      - kuzzle-cluster
    volumes:
      ${KUZ_VOLUME}
      ${KUZ_LB_VOLUME}
      - "./tmp/kuzzle2/node_modules:/var/app/node_modules"
      - "./scripts:/scripts"
      - "./config:/config"
      - "..:/var/kuzzle-plugin-cluster"
    environment:
      - MQ_BROKER_ENABLED=1
      - FEATURE_COVERAGE
      - kuzzle_cluster__retryInterval=2000
      - kuzzle_plugins__kuzzle-plugin-cluster__path=/var/kuzzle-plugin-cluster
      - kuzzle_plugins__kuzzle-plugin-cluster__activated=true
      - kuzzle_plugins__kuzzle-plugin-cluster__privileged=true

  kuzzle3:
    image: ${KUZ_IMAGE}
    container_name: kuzzle3
    command: bash /scripts/debug.sh
    networks:
      - kuzzle-cluster
    volumes:
      ${KUZ_VOLUME}
      ${KUZ_LB_VOLUME}
      - "./tmp/kuzzle3/node_modules:/var/app/node_modules"
      - "./scripts:/scripts"
      - "./config:/config"
      - "..:/var/kuzzle-plugin-cluster"
    environment:
      - MQ_BROKER_ENABLED=1
      - FEATURE_COVERAGE
      - kuzzle_cluster__retryInterval=2000
      - kuzzle_plugins__kuzzle-plugin-cluster__path=/var/kuzzle-plugin-cluster
      - kuzzle_plugins__kuzzle-plugin-cluster__activated=true
      - kuzzle_plugins__kuzzle-plugin-cluster__privileged=true

  rabbit:
    image: kuzzleio/rabbitmq:alpine
    networks:
      - kuzzle-cluster

  redis:
    image: redis:3.0-alpine
    networks: [kuzzle-cluster]

  elasticsearch:
    image: kuzzleio/elasticsearch
    networks: [kuzzle-cluster]

networks:
  kuzzle-cluster:
    driver: bridge
