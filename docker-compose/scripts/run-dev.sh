#!/bin/sh

ELASTIC_HOST=${kuzzle_services__db__host:-elasticsearch}
ELASTIC_PORT=${kuzzle_services__db__port:-9200}

rm -rf /var/app/node_modules/*
rm -rf /var/kuzzle-plugin-cluster/node_modules/*

npm install

echo "[$(date --rfc-3339 seconds)] - Waiting for elasticsearch to be available"
while ! curl -f -s -o /dev/null "http://$ELASTIC_HOST:$ELASTIC_PORT"
do
    echo "[$(date --rfc-3339 seconds)] - Still trying to connect to http://$ELASTIC_HOST:$ELASTIC_PORT"
    sleep 1
done

rm -rf /var/app/node_modules/*
rm -rf /var/kuzzle-plugin-cluster/node_modules/*

echo "[$(date --rfc-3339 seconds)] - Starting Kuzzle..."

cd /var/kuzzle-plugin-cluster

npm install --production

cd /var/app

npm install

echo "" > node_modules/pm2/lib/keymetrics

node bin/kuzzle install && pm2 start --silent /config/pm2-dev.json

nohup node-inspector --web-port=8080 --debug-port=7000 > /dev/null 2>&1&
pm2 sendSignal -s SIGUSR1 KuzzleServer
pm2 logs --lines 0 --raw
