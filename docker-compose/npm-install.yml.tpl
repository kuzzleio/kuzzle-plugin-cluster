version: '2'

services:
  loadbalancer:
    extends:
      file: docker-compose.yml
      service: loadbalancer
    command: |
      sh -c '
        cd /var/app
        set -ex
        rm -rf ./node_modules
        npm install
      '

  kuzzle:
    extends:
      file: docker-compose.yml
      service: kuzzle
    command: |
      sh -c '
        set -ex
        rm -rf ./node_modules
        rm -rf plugins/*/enabled/node_modules
        npm install
        for plugin in plugins/enabled/*/; do
          cd "$plugin"
          npm install
          cd /var/app
        done
      '

