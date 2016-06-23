loadbalancer:
  image: ${LB_IMAGE}
  container_name: kuzzle_lb
  volumes:
    ${LB_VOLUMES}
  ports:
    - "7511:7511"
    - "7512:7512"
  environment:
    - lb_backendMode=round-robin

kuzzle_master:
  image: ${KUZ_IMAGE}
  container_name: kuzzle_master
  command: bash /scripts/debug.sh
  volumes:
    ${KUZ_VOLUMES}
    - "./tmp/master/node_modules:/var/app/node_modules"
    - "./scripts:/scripts"
    - "./config:/config"
    - "..:/var/kuzzle-plugin-cluster"
  ports:
    - "8080:8080"
    - "8081:8081"
  links:
    - rabbit
    - elasticsearch
    - redis
    - loadbalancer:api
  environment:
    - MQ_BROKER_ENABLED=1
    - FEATURE_COVERAGE
    - kuzzle_pluginsManager__defaultPlugins__kuzzle-plugin-cluster__path=/var/kuzzle-plugin-cluster
    - kuzzle_pluginsManager__defaultPlugins__kuzzle-plugin-cluster__activated=true
    - kuzzle_pluginsManager__defaultPlugins__kuzzle-plugin-cluster__privileged=true

kuzzle_slave1:
  image: ${KUZ_IMAGE}
  container_name: kuzzle_slave1
  command: bash /scripts/debug.sh
  volumes:
    ${KUZ_VOLUMES}
    - "./tmp/slave1/node_modules:/var/app/node_modules"
    - "./scripts:/scripts"
    - "./config:/config"
    - "..:/var/kuzzle-plugin-cluster"
  links:
    - rabbit
    - elasticsearch
    - redis
    - loadbalancer:api
    - kuzzle_master:master
  environment:
    - MQ_BROKER_ENABLED=1
    - FEATURE_COVERAGE
    - kuzzle_cluster__mode=slave
    - kuzzle_cluster__host=master
    - kuzzle_cluster__port=7911
    - kuzzle_pluginsManager__defaultPlugins__kuzzle-plugin-cluster__path=/var/kuzzle-plugin-cluster
    - kuzzle_pluginsManager__defaultPlugins__kuzzle-plugin-cluster__activated=true
    - kuzzle_pluginsManager__defaultPlugins__kuzzle-plugin-cluster__privileged=true

kuzzle_slave2:
  image: ${KUZ_IMAGE}
  container_name: kuzzle_slave2
  command: bash /scripts/debug.sh
  volumes:
    ${KUZ_VOLUMES}
    - "./tmp/slave2/node_modules:/var/app/node_modules"
    - "./scripts:/scripts"
    - "./config:/config"
    - "..:/var/kuzzle-plugin-cluster"
  links:
    - rabbit
    - elasticsearch
    - redis
    - loadbalancer:api
    - kuzzle_master:master
  environment:
    - MQ_BROKER_ENABLED=1
    - FEATURE_COVERAGE
    - kuzzle_cluster__mode=slave
    - kuzzle_cluster__host=master
    - kuzzle_cluster__port=7911
    - kuzzle_pluginsManager__defaultPlugins__kuzzle-plugin-cluster__path=/var/kuzzle-plugin-cluster
    - kuzzle_pluginsManager__defaultPlugins__kuzzle-plugin-cluster__activated=true
    - kuzzle_pluginsManager__defaultPlugins__kuzzle-plugin-cluster__privileged=true

rabbit:
  image: kuzzleio/rabbitmq:alpine

redis:
  image: redis:3.0-alpine

elasticsearch:
  image: kuzzleio/elasticsearch

