version: "3"

services:
  nginx:
    image: nginx:1.15-alpine
    depends_on:
      - kuzzle
    ports:
      - 7512:7512
    volumes:
      - ./nginx:/etc/nginx/conf.d

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
    environment:
      NODE_ENV: ${DOLLAR}{NODE_ENV:-development}
      DEBUG: ${DOLLAR}{DEBUG:-none}
      DEBUG_COLORS: ${DOLLAR}{DEBUG_COLORS:-on}

  redis:
    build:
      context: ./redis
      args:
        - REDIS_VERSION=${DOLLAR}{REDIS_VERSION:-4.0}
    command: redis-server /usr/local/etc/redis/redis.conf

  redis_init_cluster:
    build: ./redis-cluster-init
    depends_on:
      - redis

  elasticsearch:
    image: kuzzleio/elasticsearch:5.6.10
    ulimits:
      nofile: 65536
    environment:
      cluster.name: kuzzle

