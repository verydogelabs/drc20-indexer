import { getRedis } from "./client";

export async function ensureRedisConnection() {
  while (true) {
    try {
      await getRedis();
      break; // if connection is successful, break the loop
    } catch (err) {
      console.error(
        "Failed to connect to Redis. Retrying in 5 seconds...",
        err
      );
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}
