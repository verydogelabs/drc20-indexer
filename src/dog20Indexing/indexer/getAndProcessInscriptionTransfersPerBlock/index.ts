import {
  checkDuplicateInscriptionTransfer,
  findPreviousInscriptionTransfers,
} from "../../../shared/database/queries/doge20";
import { getInscriptionTransfersPerBlock } from "../../../shared/database/queries/ordinals/inscriptionTransfer";
import { getInscriptionContent } from "../../../shared/database/queries/ordinals/inscriptions";
import { findStatusByName } from "../../../shared/database/queries/status";
import { ignoreAndSaveInscriptionTransfer } from "../../utils/inscriptionTransfer";
import { transformToDoge20InscriptionTransfer } from "../../utils/inscriptionTransfer/transformToDoge20InscriptionTransfer";
import { processDoge20Inscription } from "./processDoge20Inscription";
import { doge20TransferTypes } from "../types";
import { deleteTransactionsForBlock } from "../../../shared/database/queries/ordinals/transactions";

/* 
IMPORTANT REQUIREMENTS:
1. we index the inscription transfers in from oldest to newest within a block
*/

export const getAndProcessInscriptionTransfersPerBlock = async (
  blocknumber: number
): Promise<void> => {
  // we check how far the fetchInputAndOutputForTxsInBlock job is
  const fetchInputAndOutputForTxsInBlockStatus = await findStatusByName(
    "createInscriptionTransfers"
  );

  // if it is behind, we wait for it to catch up
  if (
    !fetchInputAndOutputForTxsInBlockStatus?.lastSyncedBlock ||
    fetchInputAndOutputForTxsInBlockStatus?.lastSyncedBlock - 2 < blocknumber
  ) {
    // sleep for 10 seconds and then try again
    console.log(
      `Waiting for createInscriptionTransfers-Job to catch up (${fetchInputAndOutputForTxsInBlockStatus?.lastSyncedBlock} vs ${blocknumber}).`
    );
    await new Promise((resolve) => setTimeout(resolve, 10000));
    await getAndProcessInscriptionTransfersPerBlock(blocknumber);
    return;
  }

  // get all inscription transfers for the block. Oldest / smallest transactionIndex first
  const inscriptionTransfers = await getInscriptionTransfersPerBlock(
    blocknumber
  );

  for (let inscriptionTransfer of inscriptionTransfers) {
    const alreadyProcessed = await checkDuplicateInscriptionTransfer({
      tx_id: inscriptionTransfer.tx_id,
      inscription: inscriptionTransfer.inscription,
    });
    if (alreadyProcessed) continue;

    const content = await getInscriptionContent(
      inscriptionTransfer.inscription
    );

    if (!content) {
      // if we don't have content the content didn't fulfill the format requirements so we ignore it
      continue;
    }

    const previousInscriptionTransfers = await findPreviousInscriptionTransfers(
      {
        inscription: inscriptionTransfer.inscription,
      }
    );

    const inscriptionTransferType = `${content?.op}-transfer-${previousInscriptionTransfers.length}`;

    if (!doge20TransferTypes.includes(inscriptionTransferType)) {
      // save the inscription transfer as non-doge-20 and continue.
      await ignoreAndSaveInscriptionTransfer(
        inscriptionTransfer,
        `invalid dog-20 inscription transfer type: ${inscriptionTransferType}`
      );
      continue;
    }

    // transform the inscription transfer to a doge-20 inscription transfer. Should be streamlined in the future
    const doge20InscriptionTransfer = transformToDoge20InscriptionTransfer({
      inscriptionTransfer,
      dog20Data: content,
      numOfPreviousInscriptionTransfers: previousInscriptionTransfers.length,
    });

    await processDoge20Inscription(doge20InscriptionTransfer);
  }

  // we delete the txs for the block since we don't need them anymore
  await deleteTransactionsForBlock(blocknumber);
};
