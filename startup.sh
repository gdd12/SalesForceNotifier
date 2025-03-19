#!/bin/bash

src_path=$(dirname "$(realpath "$0")")
trigger_file=$src_path/src/trigger.js
credentials_file_path=$src_path/config/credentials.txt
debug_config_file="$src_path/config/logging.conf"
polling_interval_minutes=5
template_config_file="$src_path/templates/configuration.xml"
config_file="$src_path/config/configuration.xml"

debug_config() {
  if [ -f "$debug_config_file" ]; then
    LOG_LEVEL=$(grep -E "^DEBUG=" "$debug_config_file" | cut -d'=' -f2)
    if [ -z "$LOG_LEVEL" ]; then
      DEBUG="false"
    fi
  else
    echo "logging.conf file not found. Defaulting to 'false'."
    DEBUG="false"
  fi
}

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

    debug_config
    export DEBUG=$LOG_LEVEL
    NODE_PATH=$src_path node $trigger_file
    exit_code=$?

    if [ $exit_code -eq 1 ]; then
      echo "Process exited due to authentication issue."
      rewrite_credentials
      continue
    elif [ $exit_code -eq 2 ]; then
      echo "An unexpected error occurred. Exiting."
      break
    elif [ $exit_code -eq 3 ]; then
      echo "Configuration file not found. Moving $template_config_file to $config_file."
      cp $template_config_file $config_file
      echo "Enter configuration and restart"
      break
    else
      sleep $(( (polling_interval_minutes - 1) * 60 ))
      echo
      for i in {60..1}; do
        echo -ne "Next fetch in $i seconds...\r"
        sleep 1
      done
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
