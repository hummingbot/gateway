#!/bin/bash 
node dist/src/index.js "$@"

while [ $? != 0 ]; do
    echo "Gateway server stopped unexpectedly. Restarting..."
    node dist/src/index.js "$@"
done