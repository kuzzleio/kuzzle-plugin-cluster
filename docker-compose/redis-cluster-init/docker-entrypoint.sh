#!/bin/bash

args=""
for container in "$@"; do
  container_ip=$(getent hosts $container | awk '{ print $1 }')

  echo "$container $container_ip"
  args="$args ${container_ip}:6379"
done

sleep 5
echo "yes" | ruby /redis-trib.rb create --replicas 0 $args
