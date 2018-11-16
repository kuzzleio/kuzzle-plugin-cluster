version: "3"

services:
  consul:
    image: consul:1.1.0
    ports:
      - 8500:8500
    command: >
      agent
        -server
        -dev
        -bind=0.0.0.0
        -client=0.0.0.0
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
    image: haproxy:1.8-alpine
    command: sh -c 'exec tail -f /dev/null'
    container_name: haproxy
    ports:
      - 7513:7512
      - 7575:7575
    labels:
      consul.skip: "true"
    volumes:
      - haproxy:/usr/local/etc/haproxy

  consultemplate:
    image: kuzzleio/consul-template:0.19
    depends_on:
      - consul
      - haproxy
      - nginx
    command: >
      -consul-addr consul:8500
      -template /templates/haproxy/haproxy.cfg.tpl:/usr/local/etc/haproxy/haproxy.cfg:reload-haproxy.sh
      -template /templates/nginx/kuzzle.conf.tpl:/usr/local/etc/nginx/kuzzle.conf:reload-nginx.sh
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./haproxy/tpl:/templates/haproxy
      - ./haproxy/reload-haproxy.sh:/usr/local/bin/reload-haproxy.sh
      - haproxy:/usr/local/etc/haproxy
      - ./nginx/tpl:/templates/nginx
      - ./nginx/reload-nginx.sh:/usr/local/bin/reload-nginx.sh
      - nginx:/usr/local/etc/nginx

  nginx:
    image: nginx:1.13-alpine
    container_name: nginx
    ports:
      - 7512:7512
    labels:
      consul.skip: "true"
    volumes:
      - nginx:/etc/nginx/conf.d

  kuzzle:
    build: ./images/kuzzle
    command: sh -c 'chmod 755 /scripts/run.sh && /scripts/run.sh'
    cap_add:
      - SYS_PTRACE
    volumes:
      ${KUZ_VOLUME}
      - ..:/var/app/plugins/enabled/cluster
      - ./scripts:/scripts
      - ./config/pm2-dev.json:/config/pm2.json
      - ./config/kuzzlerc.dev:/etc/kuzzlerc
    labels:
      consul.service: kuzzle
    environment:
      NODE_ENV: ${DOLLAR}{NODE_ENV:-development}
      DEBUG: ${DOLLAR}{DEBUG:-none}
      DEBUG_COLORS: ${DOLLAR}{DEBUG_COLORS:-on}

  redis:
    build: ./redis
    command: redis-server /usr/local/etc/redis/redis.conf

  redis_init_cluster:
    build: ./redis-cluster-init
    depends_on:
      - redis

  elasticsearch:
    image: kuzzleio/elasticsearch:5.4.1
    ulimits:
      nofile: 65536
    environment:
      cluster.name: kuzzle

volumes:
  nginx:
  haproxy:
