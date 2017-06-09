version: "2"

services:
  loadbalancer:
    image: ${LB_IMAGE}
    command: sh -c 'chmod 755 /var/app/docker-compose/scripts/run-dev.sh && /var/app/docker-compose/scripts/run-dev.sh'
    volumes:
      ${LB_VOLUME}
    ports:
      - "7512:7512"
    environment:
      - proxy_backend__mode=round-robin
      - proxy_backend__host=0.0.0.0
      - proxy_backend__socket=false
      - proxy_backend__port=7331
      - NODE_ENV=${NODE_ENV}
      - DEBUG=${LB_DEBUG}

  kuzzle:
    image: ${KUZ_IMAGE}
    command: sh -c 'chmod 755 /scripts/run.sh && /scripts/run.sh'
    volumes:
      ${KUZ_VOLUME}
      ${KUZ_LB_VOLUME}
      - "..:/var/app/plugins/enabled/kuzzle-plugin-cluster"
      - "./scripts:/scripts"
      - "./config/pm2-dev.json:/config/pm2.json"
    environment:
      - kuzzle_cluster__retryInterval=2000
      - kuzzle_services__db__client__host=http://elasticsearch:9200
      - kuzzle_services__internalCache__node__host=redis
      - kuzzle_services__memoryStorage__node__host=redis
      - kuzzle_services__proxyBroker__host=loadbalancer
      - kuzzle_services__proxyBroker__pingTimeout=200
      - kuzzle_services__internalBroker__socket=false
      - kuzzle_services__internalBroker__host=0.0.0.0
      - kuzzle_services__internalBroker__port=7911
      - kuzzle_plugins__kuzzle-plugin-cluster__privileged=true
      - kuzzle_plugins__kuzzle-plugin-logger__threads=false
      - NODE_ENV=${NODE_ENV}
      - DEBUG=${KUZ_DEBUG}

  redis:
    image: redis:3.2

  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:5.4.1
    environment:
      - cluster.name=kuzzle
      # disable xpack
      - xpack.security.enabled=false
      - xpack.monitoring.enabled=false
      - xpack.graph.enabled=false
      - xpack.watcher.enabled=false
