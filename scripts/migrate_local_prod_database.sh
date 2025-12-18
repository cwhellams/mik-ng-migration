#!/bin/bash
set -e

# Change to the ./sql directory from the root of the project
cd "$(dirname "$0")/../sql" || exit

# Run the scripts
./flyway_schema_full_local_prod.sh
