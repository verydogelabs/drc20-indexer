# Verydogelabs DRC-20 Indexer

The Verydogelabs DRC-20 Indexer is an advanced software tool that enables users to efficiently index DRC-20 tokens using two different modes. It is designed to work seamlessly with the Ord Indexer, providing robust and reliable indexing performance.

## Modes

This tool operates in two modes:

1. **Startup Mode**: This mode is optimized for rapid data acquisition from the Ord Indexer. It does not execute the generation of inscription transfers nor does it initiate any DRC-20/Doge-20 indexing tasks.
2. **Daemon Mode**: This mode allows all tasks to run continuously, ensuring constant indexing.

## Usage

Here are the recommended steps to use the DRC-20 Indexer:

1. Run the startup mode (**DAEMON=false**) until the specified startup block is reached.
2. Switch to daemon mode by setting **DAEMON=true** in the environment variables.
3. Optionally, set **SLOW_DOWN_MODE=true** to reduce the indexing speed in order to accommodate for any potential blockchain reorganizations.

## Environment Variables

Here is a list of the environment variables used by the DRC-20 Indexer along with their explanation and example values.

```shell
# Symbol names of tokens to index from ord indexer
DRC_20_SYMBOLS=drc-20
# The block until which the startup mode should run
START_BLOCK=4753897
# The block with first shibescription https://wonky-ord.dogeord.io/shibescription/15f3b73df7e5c072becb1d84191843ba080734805addfccb650929719080f62ei0
# This is the value for Dogecoin mainnet
STARTUP_BLOCK=4609723
# The last block to index (mainly for testing, development)
END_BLOCK=9712647
# The base url of the ord indexer
ORDINALS_BASE_URL=https://wonky-ord.dogeord.io
# false = startup mode, true = daemon mode
DAEMON=false

# Redis settings
# You can use a redis socket or a redis url
USE_REDIS_SOCK=true
REDIS_PATH=/var/run/redis/redis-server.sock
REDIS_URL=redis://127.0.0.1:6379

# How many blocks behind the chain should the indexer be
SLOW_DOWN_MODE_BLOCK_COUNT=100
# Set to true to slow down the indexer to cover reorgs
SLOW_DOWN_MODE=false
```