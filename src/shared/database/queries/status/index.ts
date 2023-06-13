import { IStatus, StatusName } from "../../models/status/Status";
import { getRedisClient } from "../../../redis";

export async function upsertStatus(statusData: IStatus): Promise<void> {
  const redisClient = await getRedisClient();

  try {
    const statusKey = `status:${statusData.name}`; // Use status:<name> as key

    // Set the status data in Redis
    // If the key already exists, it will be overwritten
    await redisClient.set(statusKey, JSON.stringify(statusData));
  } catch (error) {
    console.error("Failed to upsert status:", error);
    // Handle the error appropriately
  }
}

export async function findStatusByName(
  name: StatusName
): Promise<IStatus | null> {
  const redisClient = await getRedisClient();

  try {
    const statusKey = `status:${name}`; // Use status:<name> as key

    // Get the status data from Redis
    const statusData = await redisClient.get(statusKey);

    // If status data was found, parse it and return the status object
    // If no data was found, return null
    return statusData ? JSON.parse(statusData) : null;
  } catch (error) {
    console.error("Failed to find status:", error);
    // Handle the error appropriately
    return null;
  }
}

export async function findLastSyncedBlockByName(
  name: string
): Promise<number | null> {
  const redisClient = await getRedisClient();

  try {
    const statusKey = `status:${name}`; // Use status:<name> as key

    // Get the status data from Redis
    const statusData = await redisClient.get(statusKey);

    // If status data was found, parse it and return the lastSyncedBlock
    // If no data was found, return null
    return statusData ? JSON.parse(statusData).lastSyncedBlock : null;
  } catch (error) {
    throw new Error(`Failed to find last synced block for ${name}: ${error}`);
  }
}
