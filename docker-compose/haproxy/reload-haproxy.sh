#!/bin/sh

timeout 15 docker exec haproxy sh -c '[ -f /var/run/haproxy.pid ] && haproxy -D -f /usr/local/etc/haproxy/haproxy.cfg -p /var/run/haproxy.pid -st $(cat /var/run/haproxy.pid) || haproxy -D -f /usr/local/etc/haproxy/haproxy.cfg -p /var/sur/haproxy.pid' || true
