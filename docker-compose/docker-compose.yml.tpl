version: "3"

services:
  consul:
    image: consul:0.8.5
    ports:
      - 8500:8500
    command: >
      agent
        -server
        -bind=0.0.0.0
        -client=0.0.0.0
        -bootstrap-expect=1
        -ui
    labels:
      consul.skip: "true"

  container2sul:
    image: vidiben/container2sul
    depends_on:
      - consul
    labels:
      consul.skip: "true"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    environment:
      c2c_consul__host: consul

  haproxy:
    image: haproxy:1.7-alpine
    command: ash -c 'touch /var/run/haproxy.pid; tail -f /dev/null'
    container_name: haproxy
    ports:
      - 7512:7512
      - 7575:7575
    labels:
      consul.skip: "true"
    volumes:
      - haproxy:/usr/local/etc/haproxy

  consultemplate:
    image: kuzzleio/consul-template
    depends_on:
      - consul
      - haproxy
    command: >
      -consul consul:8500
      -template /templates/haproxy/haproxy.cfg.tpl:/usr/local/etc/haproxy/haproxy.cfg:reload-haproxy.sh
    volumes:
      - ./haproxy/tpl:/templates/haproxy
      - ./haproxy/reload-haproxy.sh:/usr/local/bin/reload-haproxy.sh
      - /var/run/docker.sock:/var/run/docker.sock
      - haproxy:/usr/local/etc/haproxy

  kuzzle:
    build: ./images/kuzzle
    command: sh -c 'chmod 755 /scripts/run.sh && /scripts/run.sh'
    volumes:
      ${KUZ_VOLUME}
      - "..:/var/app/plugins/enabled/cluster"
      - "./scripts:/scripts"
      - "./config/pm2-dev.json:/config/pm2.json"
    labels:
      consul.service: kuzzle
    environment:
      kuzzle_dump__enabled: "false"
      kuzzle_services__db__client__host: http://elasticsearch:9200
      kuzzle_services__internalCache__node__host: redis
      kuzzle_services__memoryStorage__node__host: redis
      kuzzle_plugins__kuzzle-plugin-logger__threads: "false"
      kuzzle_services__internalBroker__socket: "false"
      kuzzle_services__internalBroker__port: 7513
      kuzzle_server__logs__accessLogIpOffset: 1
      kuzzle_plugins__common__initTimeout: 20000
      kuzzle_plugins__cluster__privileged: "true"
      kuzzle_plugins__cluster__discover__node1: "tcp://cluster_kuzzle_1:7510"
      kuzzle_plugins__cluster__discover__node2: "tcp://cluster_kuzzle_2:7510"
      kuzzle_plugins__cluster__minimumNodes: 2
      NODE_ENV: ${DOLLAR}{NODE_ENV:-development}
      DEBUG: ${DOLLAR}{DEBUG:-kuzzle:cluster*,-kuzzle:cluster:merge,-kuzle:cluster:notify}
      DEBUG_COLORS: ${DOLLAR}{DEBUG_COLORS:-on}

  redis:
    image: redis:3.2
    ports:
      - "6379:6379"

  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:5.4.1
    environment:
      cluster.name: kuzzle
      # disable xpack
      xpack.security.enabled: "false"
      xpack.monitoring.enabled: "false"
      xpack.graph.enabled: "false"
      xpack.watcher.enabled: "false"

volumes:
   haproxy:
