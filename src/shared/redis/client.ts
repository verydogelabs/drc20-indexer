import type { RedisClientType } from "redis";
import { createClient } from "redis";
import dotenv from "dotenv";
import {
  REDIS_PATH,
  REDIS_URL,
  USE_REDIS_SOCK,
  REDIS_USERNAME,
  REDIS_PASSWORD,
} from "../config";
dotenv.config();

let client: RedisClientType;
let isReady: boolean = false;

async function getRedis(): Promise<RedisClientType> {
  if (!isReady) {
    if (USE_REDIS_SOCK) {
      client = createClient({
        socket: {
          path: REDIS_PATH,
        },
        username: REDIS_USERNAME,
        password: REDIS_PASSWORD,
      });
    } else {
      client = createClient({
        url: REDIS_URL,
      });
    }

    client.on("error", (err) => console.log(`Redis Error: ${err}`));
    client.on("connect", () => console.log("Redis connected"));
    client.on("end", () => console.log("Redis connected"));
    client.on("reconnecting", () => console.log("Redis reconnecting"));
    client.on("ready", () => {
      isReady = true;
      console.log("Redis ready!");
    });
    await client.connect();
  }
  return client;
}

getRedis()
  .then((connection) => {
    client = connection;
  })
  .catch((err) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    console.log({ err }, "Failed to connect to Redis");
  });

export { getRedis };
