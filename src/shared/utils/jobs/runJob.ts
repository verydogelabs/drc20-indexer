import { getChainhead } from "../../../ordinalsIndexing/dataProvider/ordinals";
import {
  END_BLOCK,
  STARTUP_BLOCK,
  START_BLOCK,
  SLOW_DOWN_MODE,
  SLOW_DOWN_MODE_BLOCK_COUNT,
} from "../../config";
import { StatusName } from "../../database/models/status/Status";
import {
  findLastSyncedBlockByName,
  upsertStatus,
} from "../../database/queries/status";
import { ensureRedisConnection } from "../../redis";
import { retry } from "../retry";

export const runJob = async ({
  name,
  job,
  waitTime = 5000,
}: {
  name: StatusName;
  job: (blocknumber: number) => Promise<void>;
  waitTime?: number;
}) => {
  // we wait until the redis is ready
  await ensureRedisConnection();

  const lastSyncedBlock = await findLastSyncedBlockByName(name);

  if (lastSyncedBlock) {
    console.log(`Job ${name} | last synced block is used: ${lastSyncedBlock}`);
  }

  if (lastSyncedBlock === END_BLOCK) {
    console.log(`Job ${name} | already synced to end block`);
    return;
  }

  let i =
    (lastSyncedBlock && lastSyncedBlock + 1) ||
    Math.min(START_BLOCK, STARTUP_BLOCK);
  while (END_BLOCK ? i <= END_BLOCK : true) {
    // we wait until the redis is ready
    await ensureRedisConnection();

    console.log(`Job ${name} | starting block ${i}`);
    try {
      if (SLOW_DOWN_MODE) {
        // get the last synced block from redis and check if we are in slow down mode
        const currentLastSyncedBlock = await findLastSyncedBlockByName(name);

        const chainHead = await getChainhead();

        console.log("SLOW_DOWN_MODE_BLOCK_COUNT: ", SLOW_DOWN_MODE_BLOCK_COUNT);
        console.log("chainHead: ", chainHead);
        console.log("currentLastSyncedBlock: ", currentLastSyncedBlock);

        if (
          chainHead &&
          currentLastSyncedBlock &&
          chainHead - SLOW_DOWN_MODE_BLOCK_COUNT < currentLastSyncedBlock
        ) {
          console.log(
            `${
              chainHead - currentLastSyncedBlock
            } / ${SLOW_DOWN_MODE_BLOCK_COUNT} behind chainhead. Sleep for 10 secs`
          );

          await new Promise((resolve) => setTimeout(resolve, 10000));
          continue;
        }
      }

      await job(i);
      await upsertStatus({
        name,
        lastSyncedBlock: i,
      });
      console.log(`Job ${name} | finished block ${i}`);
      i++;
    } catch (error) {
      console.error(`Job ${name} | failed at block ${i}`, error);
      console.log(
        `Waiting for a short timeout before continuing to the next block...`
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime)); // Adjust the timeout duration as needed
      continue; // Continue to the next loop iteration
    }
  }
  console.log(`Job ${name} | synced to end block`);
};

export const runJobForMultipleBlocksParallel = async ({
  name,
  job,
  blockNumbers,
}: {
  name: StatusName;
  job: (blocknumber: number) => Promise<void>;
  blockNumbers: number[];
}) => {
  // we wait until the redis is ready
  await ensureRedisConnection();

  try {
    console.log(
      `Running job ${name} from block ${blockNumbers[0]} to block ${
        blockNumbers[blockNumbers.length - 1]
      }`
    );

    const promises = blockNumbers.map((blockNumber) =>
      retry(async () => await job(blockNumber), 1000, 1000)
    );
    await Promise.all(promises);
    console.log(
      `Finished running job ${name} from block ${blockNumbers[0]} to block ${
        blockNumbers[blockNumbers.length - 1]
      }`
    );
    await upsertStatus({
      name: "startup",
      lastSyncedBlock: blockNumbers[blockNumbers.length - 1],
    });
  } catch (error) {
    console.error(`Job ${name} | failed`, error);
    await new Promise((resolve) => setTimeout(resolve, 10000));
    await runJobForMultipleBlocksParallel({ name, job, blockNumbers });
  }
};
