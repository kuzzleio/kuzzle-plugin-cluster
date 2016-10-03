#!/bin/sh

elastic=${READ_ENGINE_HOST:-elasticsearch:9200}

apk update

echo "Install SSH"
apk add openssh

echo "Install Git"
apk add git

while ! curl -silent -output /dev/null "http://${elastic}" > /dev/null
do
 echo "$(date) - still trying connecting to http://$elastic"
  sleep 1
done
echo "$(date) - connected successfully to ElasticSearch"


rm -rf /var/app/node_modules/*
rm -rf /var/kuzzle-plugin-cluster/node_modules/*

echo "Starting Kuzzle..."

cd /var/kuzzle-plugin-cluster

npm install --production

cd /var/app

npm install

node bin/kuzzle install && pm2 start /config/pm2-dev.json

nohup node-inspector --web-port=8080 --debug-port=7000 > /dev/null 2>&1&
pm2 sendSignal -s SIGUSR1 KuzzleServer

pm2 logs
