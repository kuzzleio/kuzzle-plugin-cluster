#!/bin/sh

set -eu

ELASTIC="elasticsearch:9200"

echo "Waiting for elasticsearch to be available"
while ! curl -f -s -o /dev/null "http://$ELASTIC"
do
    echo "$(date) - still trying connecting to http://$ELASTIC"
    sleep 1
done

# create a tmp index just to force the shards to init
curl -XPUT -s -o /dev/null "http://$ELASTIC/%25___tmp"
echo "Elasticsearch is up. Waiting for shards to be active (can take a while)"
E=$(curl -s "http://${ELASTIC}/_cluster/health?wait_for_status=yellow&wait_for_active_shards=1&timeout=60s")
curl -XDELETE -s -o /dev/null "http://$ELASTIC/%25___tmp"

if ! (echo ${E} | grep -E '"status":"(yellow|green)"' > /dev/null); then
    echo "Could not connect to elasticsearch in time. Aborting..."
    exit 1
fi

echo "Waiting for the whole cluster to be up and running"

while ! curl --silent http://api:7511/api/1.0/_plugin/kuzzle-plugin-cluster/status 2>&1 | grep -e \"nodesCount\":3 > /dev/null
do
    echo "$(date) - still waiting for the whole cluster to be up and running"
    sleep 1
done

echo "The whole cluster to be up and running. Let's start the tests!"

npm test
