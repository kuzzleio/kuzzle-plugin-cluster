version: '2'

services:
  kuzzle:
    extends:
      file: docker-compose.yml
      service: kuzzle
    command: |
      bash -c '
        rm -rf ./node_modules
        npm install
        rm -rf /var/app/plugins/*/enabled/node_modules
        for p in /var/app/plugins/enabled/*/; do echo $p; done
        for plugin in /var/app/plugins/enabled/*/ ; do
          echo "$plugin"
          cd "$plugin"
          npm install
          cd /var/app
        done
        rm -rf protocols/*/enabled/node_modules
        for protocols in protocols/enabled/*/; do
          cd "$protocol"
          npm install
          cd /var/app
        done
      '

