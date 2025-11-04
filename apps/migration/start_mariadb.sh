#!/bin/bash

# Configuration
CONTAINER_NAME="mariadb"
IMAGE_NAME="mariadb:10.11"
POSTGRES_USER="admin"
MARIADB_ROOT_PASSWORD="password"
HOST_PORT=3306
CONTAINER_PORT=3306

# Check if the container is already running
if [ "$(docker ps -q -f name=$CONTAINER_NAME)" ]; then
    echo "Container '$CONTAINER_NAME' is already running."
    exit 0
fi

# Check if the container exists but is stopped, then start it
if [ "$(docker ps -aq -f name=$CONTAINER_NAME)" ]; then
    echo "Starting existing container '$CONTAINER_NAME'..."
    docker start $CONTAINER_NAME
else
    echo "Creating and starting a new PostgreSQL container..."
    
    # Run the container
    docker run -d \
        --name $CONTAINER_NAME \
        -e MARIADB_ROOT_PASSWORD=$MARIADB_ROOT_PASSWORD \
        -p $HOST_PORT:$CONTAINER_PORT \
        $IMAGE_NAME
fi

echo "PostgreSQL is running on port $HOST_PORT."
