#!/bin/sh

timeout 15 docker exec nginx sh -c 'nginx -s reload' || true
