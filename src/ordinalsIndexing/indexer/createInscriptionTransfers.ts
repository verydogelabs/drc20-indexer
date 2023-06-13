import { IOutput } from "../../shared/database/models/ordinals/Output";
import { createOrUpdateInscriptionTransfer } from "../../shared/database/queries/ordinals/inscriptionTransfer";
import {
  getOutput,
  getTransactionsForBlock,
  getTxOutPutHashes,
  setInscriptionOnOutput,
} from "../../shared/database/queries/ordinals/transactions";
import { findStatusByName } from "../../shared/database/queries/status";
import { getUtxoValue } from "../dataProvider/ordinals";

export const createInscriptionTransfers = async (blockNumber: number) => {
  // we check how far the fetchInputAndOutputForTxsInBlock job is
  const fetchInputAndOutputForTxsInBlockStatus = await findStatusByName(
    "fetchBlockAndWriteTxsToDb"
  );

  // if it is behind, we wait for it to catch up
  if (
    !fetchInputAndOutputForTxsInBlockStatus?.lastSyncedBlock ||
    fetchInputAndOutputForTxsInBlockStatus?.lastSyncedBlock - 2 < blockNumber
  ) {
    // sleep for 10 seconds and then try again
    console.log(
      `Waiting for fetchBlockAndWriteTxsToDb-Job to catch up (${fetchInputAndOutputForTxsInBlockStatus?.lastSyncedBlock} (-2) vs ${blockNumber}).`
    );
    await new Promise((resolve) => setTimeout(resolve, 10000));
    await createInscriptionTransfers(blockNumber);
    return;
  }

  // get all transactions from the block
  const transactions = await getTransactionsForBlock(blockNumber);

  // if there is an existing output with an inscription that is spend as first input in this tx we have a inscription transfer
  // we only look for past txs

  for (const tx of transactions) {
    if (!tx.inputs || tx.inputs.length === 0)
      throw new Error(`No inputs for: ${tx.hash}`);

    for (const [i, input] of tx.inputs.entries()) {
      const matchingOutput = await getOutput(input.hash.toLowerCase());

      if (!matchingOutput) continue;

      if (matchingOutput?.inscriptions) {
        for (const inscription of matchingOutput?.inscriptions) {
          const outputHashes = await getTxOutPutHashes(tx.hash);

          // If there are no output hashes, throw an error
          if (outputHashes.length === 0) {
            throw new Error(`Output 0 not found for tx ${tx.hash}`);
          }

          // Check which index the first sat of the input has in the tx. This sat holds the inscription
          // So we first need to find all utxos for the inputs with a lower index than the input that holds the inscription
          const inputHashesWithLowerIndex = tx.inputs
            .slice(0, i)
            .map((input) => input.hash);

          const inputValues = [];
          for (const inputHash of inputHashesWithLowerIndex) {
            const utxo = await getOutput(inputHash, false);

            // if we have it in redis we take the value from there
            if (utxo) {
              inputValues.push(utxo.value);
            } else {
              // if not we fetch it from the ord
              const utxoFromOrd = await getUtxoValue(inputHash);
              if (!utxoFromOrd) {
                throw new Error(
                  `Utxo ${inputHash} not found for tx ${tx.hash}`
                );
              }

              inputValues.push(utxoFromOrd.value);
            }
          }

          // check if the length is correct
          if (inputValues.length !== inputHashesWithLowerIndex.length) {
            throw new Error(
              `Length mismatch for tx ${tx.hash}. Should be ${inputHashesWithLowerIndex.length} but is ${inputValues.length}.`
            );
          }

          // sum of values of inputs with lower index
          const indexOfInputSatWithInscription =
            inputValues.reduce(
              (acc, curr, index, arr) => acc + Number(curr),
              0
            ) + 1;

          // iterate through the outputs of the tx and find the output in which the sat is
          const outputs: IOutput[] = [];
          for (const outputHash of outputHashes) {
            const output: IOutput = await getOutput(outputHash, true);

            if (output) {
              outputs.push(output);
            } else {
              throw new Error(
                `Output ${outputHash} not found for tx ${tx.hash}`
              );
            }
          }

          // we track down where on which output the sat with the inscription sits
          let acc = 0;
          let indexOfOutputWithInscription;

          for (let index = 0; index < outputHashes.length; index++) {
            const o: IOutput = outputs[index];

            if (!o)
              throw new Error(`Output ${index} not found for tx ${tx.hash}`);

            if (o) {
              if (indexOfInputSatWithInscription <= acc + o.value) {
                indexOfOutputWithInscription = index;
                break;
              } else {
                acc += o.value;
              }
            } else {
              throw new Error(`Output ${index} not found for tx ${tx.hash}`);
            }
          }

          if (indexOfOutputWithInscription === undefined) {
            // in this case we either have a bug in the logic above (what we don't assume here) or the sat with the inscription was spend as fee
            // if an inscription is spend as fee we (that should only happen in the case of an inscription transfer) we handle it as transfer to itself (see https://domo-2.gitbook.io/brc-20-experiment/) so that the transferable balance becomes available again
            // we do this by only creating a inscriptionTransfer but without setting the inscription on a new output
            // and we safe the inscription transfer
            await createOrUpdateInscriptionTransfer({
              inscription: inscription,
              tx_id: tx.hash,
              sender: matchingOutput.address,
              receiver: matchingOutput.address, // the sender gets its own inscription back
              block_height: tx.blockNumber,
              isGenesis: false,
              transactionIndex: tx.index,
              input_index: input.index,
            });
          } else {
            // The output hashes are stored in the order they were added, so the output with index 0
            // should be the first one in the list
            const outputHashWithInscription =
              outputHashes[indexOfOutputWithInscription];

            // Fetch the output data
            const output: IOutput = await getOutput(
              outputHashWithInscription,
              true
            );
            if (output) {
              if (!output.transactionHash)
                throw new Error(
                  `No tx hash on output ${outputHashWithInscription}`
                );
              if (!output.hash)
                throw new Error(
                  `No hash on output ${outputHashWithInscription}`
                );
            } else {
              throw new Error(`Output 0 not found for tx ${tx.hash}`);
            }

            // we update the output of the currently processed tx that holds the sat with the inscription
            await setInscriptionOnOutput(output, inscription!);

            // and we safe the inscription transfer
            await createOrUpdateInscriptionTransfer({
              inscription: inscription!,
              tx_id: tx.hash,
              sender: matchingOutput.address,
              receiver: output.address,
              block_height: tx.blockNumber,
              isGenesis: false,
              transactionIndex: tx.index,
              input_index: input.index,
            });
          }
        }
      }
    }
  }
};
