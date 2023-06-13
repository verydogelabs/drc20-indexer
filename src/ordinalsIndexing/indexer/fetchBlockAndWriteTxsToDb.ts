import { createOrUpdateInscriptionTransfer } from "../../shared/database/queries/ordinals/inscriptionTransfer";
import { createOrUpdateInscription } from "../../shared/database/queries/ordinals/inscriptions";
import {
  getOutputsAlreadyFetched,
  setInscriptionOnOutput,
  setOutputsFetched,
  updateOutputs,
  upsertTransactions,
} from "../../shared/database/queries/ordinals/transactions";
import { retry } from "../../shared/utils/retry";
import {
  TransactionData,
  getBlockTransactionsInklData,
  getChainhead,
} from "../dataProvider/ordinals";

export const fetchBlockAndWriteTxsToDb = async (blockNumber: number) => {
  const { txIds, timestamp, transactionDatas } = await retry(
    () => getBlockTransactionsInklData(blockNumber),
    1000,
    10000
  );

  // if we have no inscriptions we retry. It apparently sometimes happens that the newest block is indexed but the inscriptions are missing. After a few seconds they appear.
  const inscr = transactionDatas.filter((el) => el.genesisInscription);
  if (inscr.length === 0) {
    // we get the chainhead. If we are not at least 2 blocks behind we wait 10 seconds and retry.
    const chainHead = await getChainhead();
    if (chainHead - blockNumber < 2) {
      await new Promise((resolve) => setTimeout(resolve, 10000));
      throw new Error(
        `No inscriptions found for block ${blockNumber}. Waited 10 seconds and now retrying...`
      );
    }
  }

  // Use the insertMany method to insert the transactions into the database
  await upsertTransactions(
    txIds.map((el, index) => ({
      hash: el,
      blockNumber,
      index,
      timestamp,
      inputs: transactionDatas[index].inputs,
    }))
  );

  const promises = transactionDatas.map(async (transactionData) => {
    processTransactionDataWithDetails(transactionData);
  });

  await Promise.all(promises);
};

const processTransactionDataWithDetails = async (
  transactionData: TransactionData
) => {
  const tx = transactionData.transaction;
  const { inputs, outputs, genesisInscription } = transactionData;

  await getOutputsAlreadyFetched(tx);
  if (tx.outputsFetched) return;

  // we generate the outputs

  await updateOutputs(tx, outputs);

  // in case of a genesis inscription we fetch the content for the inscription, create the inscription and continue. If no valid content, we skip
  if (genesisInscription && genesisInscription.content) {
    // if the content has dog-20 format we save the stringified json as content. Otherwise we don't store it for reasons of db size

    const content = genesisInscription.content;
    await createOrUpdateInscription({
      inscriptionId: genesisInscription.inscriptionId,
      genesisTx: genesisInscription.genesisTx,
      ...(content && { content }),
    });

    await setInscriptionOnOutput(outputs[0], genesisInscription.inscriptionId!);

    // and we safe the inscription transfer
    await createOrUpdateInscriptionTransfer({
      inscription: genesisInscription.inscriptionId!,
      tx_id: tx.hash,
      receiver: outputs[0].address,
      block_height: tx.blockNumber,
      isGenesis: true,
      transactionIndex: tx.index,
      input_index: 1000, // in the case of a genesis inscription there is not really an input that carried the inscription. We set it to 1000 to make it unique
    });

    setOutputsFetched(tx);
    return;
  }
};
