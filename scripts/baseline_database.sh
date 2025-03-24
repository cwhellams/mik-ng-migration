#!/bin/bash

# Change to the ./sql directory from the root of the project
cd "$(dirname "$0")/../sql" || exit

# Run the scripts
./flyway_schema_clean.sh
./flyway_schema_full.sh
./flyway_testdata_full.sh
