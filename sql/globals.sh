#!/bin/bash
assert_executable_is_on_path() {
  local exe=$1
  command -v $exe >/dev/null 2>&1 || {
    printf "This script needs executable \e[1m%s\e[0m to be installed and available in your \$PATH.\n" $exe
    printf "Please install it and try again.\n"
    exit 1
  }
}