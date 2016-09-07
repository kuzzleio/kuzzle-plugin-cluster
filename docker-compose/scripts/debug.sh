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

/bin/ash /script/run-kuzzle