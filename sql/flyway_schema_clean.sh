#!/bin/bash

# Import helper function assert_executable_is_on_path from globals.sh.
. $(dirname "$0")/globals.sh

assert_executable_is_on_path "flyway"

# Add option -X to flyway to get debug output
flyway -configFiles=./migration.conf clean 

