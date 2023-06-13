import { DAEMON, STARTUP_BLOCK, START_BLOCK } from "../shared/config";
import {
  findLastSyncedBlockByName,
  upsertStatus,
} from "../shared/database/queries/status";
import {
  runJob,
  runJobForMultipleBlocksParallel,
} from "../shared/utils/jobs/runJob";
import {
  fetchBlockAndWriteTxsToDb,
  createInscriptionTransfers,
} from "./indexer";

if (DAEMON) {
  runJob({
    name: "fetchBlockAndWriteTxsToDb",
    job: fetchBlockAndWriteTxsToDb,
  });
  runJob({
    name: "createInscriptionTransfers",
    job: createInscriptionTransfers,
  });
} else {
  (async () => {
    // iterate in 100er chunks from STARTUP_BLOCK to START_BLOCK - 1

    const lastSyncedBlock = await findLastSyncedBlockByName("startup");

    let i = lastSyncedBlock || STARTUP_BLOCK;

    while (i < START_BLOCK) {
      let increment = Math.min(100, START_BLOCK - i); // Determine step increment
      const blockNumbers = Array.from(
        { length: increment },
        (_, index) => i + index
      );
      await runJobForMultipleBlocksParallel({
        name: "fetchBlockAndWriteTxsToDb",
        job: fetchBlockAndWriteTxsToDb,
        blockNumbers,
      });
      i += increment; // Increment i
    }
    // when the startup mode is done we set the lastSyncedBlock of fetchBlockAndWriteTxsToDb to the lastSyncedBlock of startup
    const lastSyncedBlockAfterStartupMode = await findLastSyncedBlockByName(
      "startup"
    );
    await upsertStatus({
      name: "fetchBlockAndWriteTxsToDb",
      lastSyncedBlock: lastSyncedBlockAfterStartupMode!,
    });
  })();
}
