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
    command: bash /scripts/run-dev.sh
    networks:
      - kuzzle-cluster
    volumes:
      ${KUZ_VOLUME}
      ${KUZ_LB_VOLUME}
      - "./tmp/kuzzle1/node_modules:/var/app/node_modules"
      - "./scripts:/scripts"
      - "./config:/config"
      - "..:/var/kuzzle-plugin-cluster"
      - "./tmp/kuzzle1/plugin-cluster/node_modules:/var/kuzzle-plugin-cluster/node_modules"
    ports:
      - "8080:8080"
    environment:
      - FEATURE_COVERAGE
      - kuzzle_services__db__host=elasticsearch
      - kuzzle_services__internalCache__node__host=redis
      - kuzzle_services__memoryStorage__node__host=redis
      - kuzzle_services__proxyBroker__host=kuzzle_lb
      - kuzzle_cluster__retryInterval=2000
      - kuzzle_plugins__kuzzle-plugin-cluster__path=/var/kuzzle-plugin-cluster
      - kuzzle_plugins__kuzzle-plugin-cluster__activated=true
      - kuzzle_plugins__kuzzle-plugin-cluster__privileged=true

  kuzzle2:
    image: ${KUZ_IMAGE}
    container_name: kuzzle2
    command: bash /scripts/run-dev.sh
    networks:
      - kuzzle-cluster
    volumes:
      ${KUZ_VOLUME}
      ${KUZ_LB_VOLUME}
      - "./tmp/kuzzle2/node_modules:/var/app/node_modules"
      - "./scripts:/scripts"
      - "./config:/config"
      - "..:/var/kuzzle-plugin-cluster"
      - "./tmp/kuzzle2/plugin-cluster/node_modules:/var/kuzzle-plugin-cluster/node_modules"
    environment:
      - MQ_BROKER_ENABLED=1
      - FEATURE_COVERAGE
      - kuzzle_services__db__host=elasticsearch
      - kuzzle_services__internalCache__node__host=redis
      - kuzzle_services__memoryStorage__node__host=redis
      - kuzzle_services__proxyBroker__host=kuzzle_lb
      - kuzzle_cluster__retryInterval=2000
      - kuzzle_plugins__kuzzle-plugin-cluster__path=/var/kuzzle-plugin-cluster
      - kuzzle_plugins__kuzzle-plugin-cluster__activated=true
      - kuzzle_plugins__kuzzle-plugin-cluster__privileged=true

  kuzzle3:
    image: ${KUZ_IMAGE}
    container_name: kuzzle3
    command: bash /scripts/run-dev.sh
    networks:
      - kuzzle-cluster
    volumes:
      ${KUZ_VOLUME}
      ${KUZ_LB_VOLUME}
      - "./tmp/kuzzle3/node_modules:/var/app/node_modules"
      - "./scripts:/scripts"
      - "./config:/config"
      - "..:/var/kuzzle-plugin-cluster"
      - "./tmp/kuzzle3/plugin-cluster/node_modules:/var/kuzzle-plugin-cluster/node_modules"
    environment:
      - MQ_BROKER_ENABLED=1
      - FEATURE_COVERAGE
      - kuzzle_services__db__host=elasticsearch
      - kuzzle_services__internalCache__node__host=redis
      - kuzzle_services__memoryStorage__node__host=redis
      - kuzzle_services__proxyBroker__host=kuzzle_lb
      - kuzzle_cluster__retryInterval=2000
      - kuzzle_plugins__kuzzle-plugin-cluster__path=/var/kuzzle-plugin-cluster
      - kuzzle_plugins__kuzzle-plugin-cluster__activated=true
      - kuzzle_plugins__kuzzle-plugin-cluster__privileged=true

  redis:
    image: redis:3.2
    networks: [kuzzle-cluster]

  elasticsearch:
    image: elasticsearch:2.3.4
    networks: [kuzzle-cluster]

networks:
  kuzzle-cluster:
    driver: bridge
