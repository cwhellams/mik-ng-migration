#!/bin/bash

# Configuration
CONTAINER_NAME="postgres_container"
IMAGE_NAME="postgres:latest"
POSTGRES_USER="admin"
POSTGRES_PASSWORD="password"
POSTGRES_DB="mydatabase"
VOLUME_NAME="postgres_data"
HOST_PORT=5432
CONTAINER_PORT=5432

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
        -e POSTGRES_USER=$POSTGRES_USER \
        -e POSTGRES_PASSWORD=$POSTGRES_PASSWORD \
        -e POSTGRES_DB=$POSTGRES_DB \
        -p $HOST_PORT:$CONTAINER_PORT \
        -v $VOLUME_NAME:/var/lib/postgresql/data \
        --restart unless-stopped \
        $IMAGE_NAME
fi

echo "PostgreSQL is running on port $HOST_PORT."
