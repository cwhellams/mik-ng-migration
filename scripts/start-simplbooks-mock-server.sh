#!/bin/bash

# Get the directory of the script
SCRIPT_DIR="$(dirname "$(realpath "$0")")"

# Use the script's directory to resolve relative paths
FILE_PATH="$SCRIPT_DIR/../simplbooks/simplbooks-api/api.yaml"

prism mock $FILE_PATH
