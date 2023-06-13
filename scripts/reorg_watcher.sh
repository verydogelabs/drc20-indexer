#!/bin/bash
set -o nounset
set -o errexit
set -o pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)";
cd "${SCRIPT_DIR}/../" || exit;
source .env || exit;

# Check if redis-cli is installed
if ! command -v redis-cli &> /dev/null; then
    echo "redis-cli could not be found. Please install it via 'apt install redis-tools'."
    exit
fi

# Check if mail is installed
if ! command -v mail &> /dev/null; then
    echo "mail could not be found. Please install it via 'apt install mailutils'."
    exit
fi

EMAIL_ADDRESS="${ALARM_EMAIL_ADDRESS}"
DOCKER_COMPOSE_SERVICE_NAME="indexer"
EXECUTOR="${DOCKER_USER}"

REDIS_KEY="status:reorgSaveBlockHeight"
REDIS_CHAINHEAD_KEY="status:currentBlockHeight"
REDIS_SERVER_URL="${REDIS_URL}";
REDIS_BACKUP_DIR="${REDIS_BACKUP_DIR}";
REDIS_DATA_DIR="${REDIS_DATA_DIR}"
REDIS_DUMP_FILE_PREFIX="dump"
REDIS_SERVER_NAME="redis-server"
REDIS_HOST_NAME="${REDIS_HOST_NAME}"

DNS_RECORD_ID="${DNS_RECORD_ID}"
DNS_ZONE_ID="${DNS_ZONE_ID}"
DNS_API_TOKEN="${DNS_API_TOKEN}"

# Fetch slow-down-mode status from root of repo
SLOW_DOWN_MODE_FILE="${SCRIPT_DIR}/../../slow-down-mode.status"
if [ ! -f "$SLOW_DOWN_MODE_FILE" ]; then
    echo "Error: $SLOW_DOWN_MODE_FILE does not exist"
    exit 1
fi

SLOW_DOWN_MODE=$(cat "$SLOW_DOWN_MODE_FILE") || exit

variables=("SLOW_DOWN_MODE" "DNS_ZONE_ID" "DNS_API_TOKEN" "REDIS_HOST_NAME" "REDIS_KEY" "EMAIL_ADDRESS" "DOCKER_COMPOSE_SERVICE_NAME" "EXECUTOR" "REDIS_SERVER_URL" "REDIS_BACKUP_DIR" "REDIS_DATA_DIR" "REDIS_DUMP_FILE_PREFIX" "REDIS_SERVER_NAME" "DNS_RECORD_ID")
for variable_name in "${variables[@]}"
do
  if [ -z "${!variable_name}" ]
  then
    echo "Error: $variable_name is not set or empty"
    exit 1
  fi
done

while true; do
  sleep 3
  echo "Getting $REDIS_CHAINHEAD_KEY on $REDIS_SERVER_URL"
  chainhead=$(redis-cli -u "$REDIS_SERVER_URL" GET $REDIS_KEY)
  echo "$REDIS_CHAINHEAD_KEY: $chainhead"

  echo "Block $chainhead - $REDIS_KEY for reorg event on $REDIS_SERVER_URL"
  redis_val=$(redis-cli -u "$REDIS_SERVER_URL" GET $REDIS_KEY)
  echo "Block $chainhead - $chainhead - $REDIS_KEY: $redis_val"
  if [[ $redis_val =~ ^[0-9]+$ ]]; then
    mail -s "Block $chainhead - Reorg Detected - Performing Reorg Handling" $EMAIL_ADDRESS <<EOF
Starting process to handle reorg detected at block height $redis_val.
EOF
    echo "Block $chainhead - Stopping ${DOCKER_COMPOSE_SERVICE_NAME} service"
    su - "${EXECUTOR}" -c "cd ${SCRIPT_DIR}/../ && docker compose stop ${DOCKER_COMPOSE_SERVICE_NAME}"
    echo "Block $chainhead - Stopped ${DOCKER_COMPOSE_SERVICE_NAME} service"

    # If I am in Slow Down Mode (SLOW_DOWN_MODE="true") then set SLOW_DOWN_MODE="false" and restart the indexer
    # Send an email that the indexer is restarted with slow down mode false and the reorg is handled successfully

    if [[ $SLOW_DOWN_MODE == "true" ]]; then
      echo "Block $chainhead - Slow Down Mode is enabled. Setting it to false"
      # Update .env
      sed -i "s/^SLOW_DOWN_MODE=.*/SLOW_DOWN_MODE=false/" .env
      echo "false" > "$SLOW_DOWN_MODE_FILE"
      echo "Block $chainhead - Slow Down Mode is set to false"

      # restart the indexer service with --build flag
      echo "Block $chainhead - Restarting ${DOCKER_COMPOSE_SERVICE_NAME} service"
      su - "${EXECUTOR}" -c "cd ${SCRIPT_DIR}/../ && docker compose up -d --build ${DOCKER_COMPOSE_SERVICE_NAME}"
      echo "Block $chainhead - Restarted ${DOCKER_COMPOSE_SERVICE_NAME} service with slow down mode false"

      mail -s "Block $chainhead - Reorg Detected - Slow Down Mode Disabled and indexer newly started" $EMAIL_ADDRESS <<EOF
Slow Down Mode is disabled and indexer is newly started.
EOF

      # Update the DNS record with the new IP address
      echo "Block $chainhead - Updating DNS record with the new IP address"
      # get the Ip address of the internal network (10.0.0.x)
      ip_address=$(ip -4 addr | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | grep '^10\.0\.0\.' | head -n 1)
      echo "Block $chainhead - IP address: $ip_address"

      http_code=$(curl -o /dev/null -s -w "%{http_code}" -X "PUT" "https://dns.hetzner.com/api/v1/records/${DNS_RECORD_ID}" \
         -H "Content-Type: application/json" \
         -H "Auth-API-Token: ${DNS_API_TOKEN}" \
         -d "{
             \"value\": \"${ip_address}\",
             \"ttl\": 0,
             \"type\": \"A\",
             \"name\": \"${REDIS_HOST_NAME}\",
             \"zone_id\": \"${DNS_ZONE_ID}\"
         }")

      if ((http_code < 200 || http_code > 299)); then
          echo "Block $chainhead - Setting the new main redis DNS record failed $http_code" | mail -s "Block $chainhead - Setting DNS record failed" $EMAIL_ADDRESS
      fi
      echo "Block $chainhead - Updated DNS record with the new IP address"

    else
      echo "Block $chainhead - Slow Down Mode is disabled."
      echo "Block $chainhead - Stopping redis-server"

      sleep 30
      sudo service $REDIS_SERVER_NAME stop
      echo "Block $chainhead - Stopped redis-server"

      second_last_dump=$(ls -tr $REDIS_BACKUP_DIR/$REDIS_DUMP_FILE_PREFIX.rdb.* | tail -n 2 | head -n 1)
      echo "Block $chainhead - Copying the second last dump file $second_last_dump to the current redis data dir"
      mv $second_last_dump $REDIS_DATA_DIR/$REDIS_DUMP_FILE_PREFIX.rdb
      chmod 660 $REDIS_DATA_DIR/$REDIS_DUMP_FILE_PREFIX.rdb
      chown redis:redis $REDIS_DATA_DIR/$REDIS_DUMP_FILE_PREFIX.rdb
      echo "Block $chainhead - Copied the second last dump file to the current redis data dir"

      echo "Block $chainhead - Starting redis-server"
      sudo service $REDIS_SERVER_NAME start
      echo "Block $chainhead - Started redis-server"

      echo "Block $chainhead - Waiting for 10 minutes to let the redis server start"
      sleep 600

      echo "Block $chainhead - Checking if redis-server is running"
      redis_status=$(sudo service $REDIS_SERVER_NAME status)
      if [[ $redis_status == *"active (running)"* ]]; then
        echo "Block $chainhead - Redis server is running"

        mail -s "Block $chainhead - Reorg Recovery Successful" $EMAIL_ADDRESS <<EOF
Redis server restarted and everything seems fine. Starting the indexer now.
EOF

        mail -s "Block $chainhead - Reorg Detected - Slow Down Mode Enabled and indexer newly started" $EMAIL_ADDRESS <<EOF
Slow Down Mode is enabled and indexer is newly started.
EOF

        # Update .env
        sed -i "s/^SLOW_DOWN_MODE=.*/SLOW_DOWN_MODE=true/" .env

        # the indexer should be started with slow down mode true
        echo "true" > "$SLOW_DOWN_MODE_FILE"
        su - "${EXECUTOR}" -c "cd ${SCRIPT_DIR}/../ && docker compose start ${DOCKER_COMPOSE_SERVICE_NAME}"
      else
        echo "Block $chainhead - Redis server failed to start"
        mail -s "Block $chainhead - Reorg Recovery Failed" $EMAIL_ADDRESS <<EOF
Redis server failed to start. Please check the server.
EOF
      fi
    fi
    # in any case, set the reorg flag to false to avoid reorg handling again
    redis-cli -u "$REDIS_SERVER_URL" SET $REDIS_KEY false
  fi
done