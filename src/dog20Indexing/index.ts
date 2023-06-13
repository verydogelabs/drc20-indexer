import { DAEMON } from "../shared/config";
import { runJob } from "../shared/utils/jobs/runJob";
import { getAndProcessInscriptionTransfersPerBlock } from "./indexer";

if (DAEMON) {
  runJob({
    name: "getAndProcessInscriptionTransfers",
    job: getAndProcessInscriptionTransfersPerBlock,
  });
}
