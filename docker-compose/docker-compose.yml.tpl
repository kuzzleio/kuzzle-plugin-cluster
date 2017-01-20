version: "2"

services:
  loadbalancer:
    image: ${LB_IMAGE}
    container_name: loadbalancer
    command: sh -c 'chmod 755 /var/app/docker-compose/scripts/run-dev.sh && /var/app/docker-compose/scripts/run-dev.sh'
    networks:
      kuzzle-cluster:
        aliases:
          - api
    volumes:
      ${LB_VOLUME}
    ports:
      - "7511-7513:7511-7513"
    environment:
      - proxy_backend__mode=round-robin
      - proxy_backend__host=0.0.0.0
      - proxy_backend__socket=false
      - proxy_backend__port=7331
  kuzzle1:
    image: ${KUZ_IMAGE}
    container_name: kuzzle1
    command: sh -c 'chmod 755 /scripts/run-dev.sh && /scripts/run-dev.sh'
    networks:
      - kuzzle-cluster
    volumes:
      ${KUZ_VOLUME}
      ${KUZ_LB_VOLUME}
      - "..:/var/kuzzle-plugin-cluster"
      - "./scripts:/scripts"
      - "./config/pm2-dev.json:/config/pm2.json"
      - "./tmp/kuzzle1/node_modules:/var/app/node_modules"
      - "./tmp/kuzzle1/plugin-cluster/node_modules:/var/kuzzle-plugin-cluster/node_modules"
    ports:
      - "8080:8080"
    environment:
      - kuzzle_cluster__retryInterval=2000
      - kuzzle_services__db__host=elasticsearch
      - kuzzle_services__internalCache__node__host=redis
      - kuzzle_services__memoryStorage__node__host=redis
      - kuzzle_services__proxyBroker__host=loadbalancer
      - kuzzle_services__internalBroker__socket=false
      - kuzzle_services__internalBroker__host=0.0.0.0
      - kuzzle_services__internalBroker__port=7911
      - kuzzle_plugins__kuzzle-plugin-cluster__path=/var/kuzzle-plugin-cluster
      - kuzzle_plugins__kuzzle-plugin-cluster__activated=true
      - kuzzle_plugins__kuzzle-plugin-cluster__privileged=true
      - kuzzle_plugins__kuzzle-plugin-cluster__version=

  kuzzle2:
    image: ${KUZ_IMAGE}
    container_name: kuzzle2
    command: sh -c 'chmod 755 /scripts/run-dev.sh && /scripts/run-dev.sh'
    networks:
      - kuzzle-cluster
    volumes:
      ${KUZ_VOLUME}
      ${KUZ_LB_VOLUME}
      - "..:/var/kuzzle-plugin-cluster"
      - "./scripts:/scripts"
      - "./config/pm2-dev.json:/config/pm2.json"
      - "./tmp/kuzzle2/node_modules:/var/app/node_modules"
      - "./tmp/kuzzle2/plugin-cluster/node_modules:/var/kuzzle-plugin-cluster/node_modules"
    environment:
      - kuzzle_cluster__retryInterval=2000
      - kuzzle_services__db__host=elasticsearch
      - kuzzle_services__internalCache__node__host=redis
      - kuzzle_services__memoryStorage__node__host=redis
      - kuzzle_services__proxyBroker__host=loadbalancer
      - kuzzle_services__internalBroker__socket=false
      - kuzzle_services__internalBroker__host=0.0.0.0
      - kuzzle_services__internalBroker__port=7911
      - kuzzle_plugins__kuzzle-plugin-cluster__path=/var/kuzzle-plugin-cluster
      - kuzzle_plugins__kuzzle-plugin-cluster__activated=true
      - kuzzle_plugins__kuzzle-plugin-cluster__privileged=true
      - kuzzle_plugins__kuzzle-plugin-cluster__version=

  kuzzle3:
    image: ${KUZ_IMAGE}
    container_name: kuzzle3
    command: sh -c 'chmod 755 /scripts/run-dev.sh && /scripts/run-dev.sh'
    networks:
      - kuzzle-cluster
    volumes:
      ${KUZ_VOLUME}
      ${KUZ_LB_VOLUME}
      - "..:/var/kuzzle-plugin-cluster"
      - "./scripts:/scripts"
      - "./config/pm2-dev.json:/config/pm2.json"
      - "./tmp/kuzzle3/node_modules:/var/app/node_modules"
      - "./tmp/kuzzle3/plugin-cluster/node_modules:/var/kuzzle-plugin-cluster/node_modules"
    environment:
      - kuzzle_cluster__retryInterval=2000
      - kuzzle_services__db__host=elasticsearch
      - kuzzle_services__internalCache__node__host=redis
      - kuzzle_services__memoryStorage__node__host=redis
      - kuzzle_services__proxyBroker__host=loadbalancer
      - kuzzle_services__internalBroker__socket=false
      - kuzzle_services__internalBroker__host=0.0.0.0
      - kuzzle_services__internalBroker__port=7911
      - kuzzle_plugins__kuzzle-plugin-cluster__path=/var/kuzzle-plugin-cluster
      - kuzzle_plugins__kuzzle-plugin-cluster__activated=true
      - kuzzle_plugins__kuzzle-plugin-cluster__privileged=true
      - kuzzle_plugins__kuzzle-plugin-cluster__version=

  redis:
    image: redis:3.2
    networks:
      - kuzzle-cluster

  elasticsearch:
    image: elasticsearch:5.0
    networks:
      - kuzzle-cluster

networks:
  kuzzle-cluster:
    driver: bridge
