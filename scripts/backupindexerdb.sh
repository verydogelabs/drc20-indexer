#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)";
cd ${SCRIPT_DIR}/../ || exit;

source .env || exit;

if [ -z "$1" ]; then
  echo "You need to set path to the redis.db file.";
  exit 1;
fi
rdb_file_path=$1

if [ ! -f "$rdb_file_path" ]; then
    echo "File does not exist."
    exit 1;
fi

backup_dir_path=$2
if [ ! -d "$backup_dir_path" ]; then
    echo "Backup dir does not exist."
    exit 1;
fi

REDIS_KEY="status:reorgSaveBlockHeight"
EMAIL_ADDRESS="${ALARM_EMAIL_ADDRESS}"
REDIS_SERVER_URL="${REDIS_URL}";

echo "Checking $REDIS_KEY for reorg event on $REDIS_SERVER_URL"
redis_val=$(redis-cli -u "$REDIS_SERVER_URL" GET $REDIS_KEY)
echo "$REDIS_KEY: $redis_val"
if [[ $redis_val =~ ^[0-9]+$ ]]; then
  mail -s "Reorg Detected - Performing DB backup" $EMAIL_ADDRESS <<EOF
Don't backup.
EOF
else
  echo "Backup process started"
  find "${backup_dir_path}" -type f -name "dump.rdb.*" -mmin +480 -delete

  # Create a backup of the file with a timestamp
  timestamp=$(date +%Y-%m-%d_%H-%M-%S)
  cp ${rdb_file_path} "${backup_dir_path}/dump.rdb.${timestamp}"
  echo "Backup process finished - ${backup_dir_path}/dump.rdb.${timestamp}"
fi

