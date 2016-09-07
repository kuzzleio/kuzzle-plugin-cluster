#!/bin/sh

apk update

echo "Install SSH"
apk add openssh

echo "Install Git"
apk add git

tail -f /dev/null
