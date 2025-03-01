#!/bin/bash

src_path=$(dirname "$(realpath "$0")")
trigger_file=$src_path/src/trigger.js
credentials_file_path=$src_path/config/credentials.txt
polling_interval_minutes=5

startup() {
  clear
  if [ ! -f "$credentials_file_path" ]; then
    echo "No credential file found."
    rewrite_credentials
  fi
  while true; do
    current_time=$(date +"%a %b %d %H:%M:%S")
    echo "Fetching batch @ $current_time"
    echo

    NODE_PATH=$src_path node $trigger_file
    exit_code=$?

    if [ $exit_code -eq 1 ]; then
      echo "Process exited due to authentication issue."
      rewrite_credentials
      continue
    elif [ $exit_code -eq 2 ]; then
      echo "An unexpected error occurred. Exiting."
      break
    else
      sleep $((polling_interval_minutes * 60))
      clear
      continue
    fi
  done
}

rewrite_credentials() {
  echo
  echo ==== Credential Input Required ====
  read -p " Enter new Session ID >> " sid
  echo
  read -p " Enter new token  >> " token

  echo -e "$sid\n$token" > $credentials_file_path
  clear
  echo "Updated credentials, restarting..."
}
startup
