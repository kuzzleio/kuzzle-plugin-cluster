version: "2"

services:
  kuzzle4:
    image: ${KUZ_IMAGE}
    container_name: kuzzle4
    command: sh -c 'chmod 755 /scripts/run-dev.sh && /scripts/run-dev.sh'
    networks:
      - kuzzle-cluster
    depends_on:
      - redis
      - elasticsearch
      - loadbalancer
    volumes:
      ${KUZ_VOLUME}
      ${KUZ_LB_VOLUME}
      - "..:/var/kuzzle-plugin-cluster"
      - "./scripts:/scripts"
      - "./config/pm2-dev.json:/config/pm2.json"
      - "./tmp/kuzzle4/node_modules:/var/app/node_modules"
      - "./tmp/kuzzle4/plugin-cluster/node_modules:/var/kuzzle-plugin-cluster/node_modules"
    environment:
      - kuzzle_cluster__retryInterval=2000
      - kuzzle_services__db__host=elasticsearch
      - kuzzle_services__internalCache__node__host=redis
      - kuzzle_services__memoryStorage__node__host=redis
      - kuzzle_services__proxyBroker__host=kuzzle_lb
      - kuzzle_plugins__kuzzle-plugin-cluster__path=/var/kuzzle-plugin-cluster
      - kuzzle_plugins__kuzzle-plugin-cluster__activated=true
      - kuzzle_plugins__kuzzle-plugin-cluster__privileged=true

  kuzzle5:
    image: ${KUZ_IMAGE}
    container_name: kuzzle5
    command: sh -c 'chmod 755 /scripts/run-dev.sh && /scripts/run-dev.sh'
    networks:
      - kuzzle-cluster
    depends_on:
      - redis
      - elasticsearch
      - loadbalancer
    volumes:
      ${KUZ_VOLUME}
      ${KUZ_LB_VOLUME}
      - "..:/var/kuzzle-plugin-cluster"
      - "./scripts:/scripts"
      - "./config/pm2-dev.json:/config/pm2.json"
      - "./tmp/kuzzle5/node_modules:/var/app/node_modules"
      - "./tmp/kuzzle5/plugin-cluster/node_modules:/var/kuzzle-plugin-cluster/node_modules"
    environment:
      - kuzzle_cluster__retryInterval=2000
      - kuzzle_services__db__host=elasticsearch
      - kuzzle_services__internalCache__node__host=redis
      - kuzzle_services__memoryStorage__node__host=redis
      - kuzzle_services__proxyBroker__host=kuzzle_lb
      - kuzzle_plugins__kuzzle-plugin-cluster__path=/var/kuzzle-plugin-cluster
      - kuzzle_plugins__kuzzle-plugin-cluster__activated=true
      - kuzzle_plugins__kuzzle-plugin-cluster__privileged=true

networks:
  kuzzle-cluster:
    driver: bridge
