import { RedisClientType } from "redis";
import { IOutput } from "../../shared/database/models/ordinals/Output";
// import { findPreviousInscriptionTransfers } from "../../shared/database/queries/doge20";
import { createOrUpdateInscriptionTransfer } from "../../shared/database/queries/ordinals/inscriptionTransfer";
import {
  getOutput,
  getOutputs,
  getTransactionsForBlock,
  getTxOutPutHashes,
  setInscriptionOnOutput,
  setInscriptionsOnOutput,
} from "../../shared/database/queries/ordinals/transactions";

import { findStatusByName } from "../../shared/database/queries/status";
import { getRedisClient } from "../../shared/redis";
import { getUtxoValue, getUtxoValueCached } from "../dataProvider/ordinals";

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
    await new Promise((resolve) => setTimeout(resolve, 10000));
    await createInscriptionTransfers(blockNumber);
    return;
  }
  // get all transactions from the block
  const transactions = await getTransactionsForBlock(blockNumber);
  // if there is an existing output with an inscription that is spend as first input in this tx we have a inscription transfer
  // we only look for past txs

  const redisClient = await getRedisClient();
  const allInputsOfBlock = [];
  for (const tx of transactions) {
    for (const input of tx.inputs || []) {
      allInputsOfBlock.push(input.hash.toLowerCase());
    }
  }

  // build map of inputhash to outputs
  const inputHashToUtxo = new Map<string, IOutput>();

  const allInputUtxosOfBlock = await getOutputs(allInputsOfBlock);
  for (const [newIndex, output] of allInputUtxosOfBlock.entries()) {
    inputHashToUtxo.set(allInputsOfBlock[newIndex], output);
  }

  if (allInputsOfBlock.length !== inputHashToUtxo.size) {
    throw new Error(
      `Length mismatch for block ${blockNumber}. Should be ${allInputsOfBlock.length} but is ${inputHashToUtxo.size}.`
    );
  }

  // build maps txToOutputHashes
  const txToOutputHashes = new Map<string, string[]>();
  const allOutputHashesOfBlock: any[] = [];

  // Initiate all promises at once and wait for them to resolve

  const allPromises = transactions.map((tx) =>
    getTxOutPutHashes(tx.hash).then((outputHashes) => {
      if (!outputHashes) {
        throw new Error(`Output hashes not found for tx ${tx.hash}`);
      }
      txToOutputHashes.set(tx.hash, outputHashes);
      return outputHashes;
    })
  );

  try {
    const results = await Promise.all(allPromises);

    results.forEach((outputHashes) => {
      allOutputHashesOfBlock.push(...outputHashes);
    });
  } catch (error) {
    // Handle any errors that occurred during the Promise.all execution
    throw new Error(`Error fetching output hashes for block ${blockNumber}`);
    console.error(error);
    // Depending on your error handling strategy, you might want to rethrow or handle the error differently
  }

  // build outputHashToOutput
  const allOutputUtxosOfBlock = await getOutputs(allOutputHashesOfBlock);
  const outputHashToUtxo = new Map<string, IOutput>();
  for (const [newIndex, output] of allOutputUtxosOfBlock.entries()) {
    outputHashToUtxo.set(allOutputHashesOfBlock[newIndex], output);
  }

  const outputHashesToUpdate = new Set<string>();

  let multiRedisClient = redisClient.multi();

  for (const tx of transactions) {
    if (!tx.inputs || tx.inputs.length === 0)
      throw new Error(`No inputs for: ${tx.hash}`);

    if (
      tx.inputs.length === 1 &&
      tx.inputs[0].hash.startsWith(
        "0000000000000000000000000000000000000000000000000000000000000000"
      )
    ) {
      continue;
    }

    // const outputs = await getOutputs(
    //   tx.inputs.map((el) => el.hash.toLowerCase())
    // );
    const outputHashes = txToOutputHashes.get(tx.hash);

    for (const [i, input] of tx.inputs.entries()) {
      const matchingOutput = inputHashToUtxo.get(input.hash);

      // if (matchingOutput?.hash !== allOutPutsOfBlock[inputIndex]?.hash) {
      //   throw new Error(
      //     `Hash mismatch for tx ${tx.hash}. Should be ${allOutPutsOfBlock[inputIndex]?.hash} but is ${matchingOutput?.hash}.`
      //   );
      // }

      if (matchingOutput && input?.hash !== matchingOutput?.hash) {
        throw new Error(
          `Hash mismatch for tx ${input?.hash}. Should be ${matchingOutput?.hash} but is ${input.hash}.`
        );
      }

      if (!matchingOutput) continue;

      if (outputHashes?.length === undefined) {
        throw new Error(`Output hashes not found for tx ${tx.hash}`);
      }

      if (outputHashes?.length === 0) {
        throw new Error(`Output 0 not found for tx ${tx.hash}`);
      }

      // Check which index the first sat of the input has in the tx. This sat holds the inscription
      // So we first need to find all utxos for the inputs with a lower index than the input that holds the inscription
      const inputHashesWithLowerIndex = tx.inputs
        .slice(0, i)
        .map((input) => input.hash);

      const inputValues = [];

      for (const inputHash of inputHashesWithLowerIndex) {
        const utxo = inputHashToUtxo.get(inputHash);

        // if we have it in redis we take the value from there
        if (utxo) {
          inputValues.push(utxo.value);
        } else {
          // if not we fetch it from the ord
          // const utxoFromOrd = await getUtxoValue(inputHash);
          const utxoFromOrd = await getUtxoValueCached(inputHash);

          // if (
          //   utxoFromOrd.value !== utxoFromOrdCached.value ||
          //   utxoFromOrd.address !== utxoFromOrdCached.address
          // ) {
          //   console.log("utxoFromOrd", utxoFromOrd);
          //   console.log("utxoFromOrdCached", utxoFromOrdCached);
          //   throw new Error(
          //     "utxoFromOrd.value !== utxoFromOrdCached.value || utxoFromOrd.address !== utxoFromOrdCached.address"
          //   );
          // }

          if (!utxoFromOrd) {
            throw new Error(`Utxo ${inputHash} not found for tx ${tx.hash}`);
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
        inputValues.reduce((acc, curr, index, arr) => acc + Number(curr), 0) +
        1;

      // iterate through the outputs of the tx and find the output in which the sat is
      const outputs: IOutput[] = [];
      for (const outputHash of outputHashes) {
        const output: IOutput | undefined = outputHashToUtxo.get(outputHash);

        if (output) {
          outputs.push(output);
        } else {
          throw new Error(`Output ${outputHash} not found for tx ${tx.hash}`);
        }
      }

      // we track down where on which output the sat with the inscription sits
      let acc = 0;
      let indexOfOutputWithInscription;

      for (let index = 0; index < outputHashes.length; index++) {
        const o: IOutput = outputs[index];

        if (!o) throw new Error(`Output ${index} not found for tx ${tx.hash}`);

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

      for (const inscription of matchingOutput?.inscriptions || []) {
        // count for the number of times this inscription was transferred
        // const count = (
        //   await findPreviousInscriptionTransfers({
        //     inscription: inscription,
        //   })
        // ).length;

        // console.log("-------> count", count);

        // // we only save the first 3, actually we only need 2 but keep another 1 for debug purposes
        // // temporarily we set it to 2
        // if (Number(count) > 2) {
        //   continue;
        // }

        // If there are no output hashes, throw an error

        if (indexOfOutputWithInscription === undefined) {
          // in this case we either have a bug in the logic above (what we don't assume here) or the sat with the inscription was spend as fee
          // if an inscription is spend as fee we (that should only happen in the case of an inscription transfer) we handle it as transfer to itself (see https://domo-2.gitbook.io/brc-20-experiment/) so that the transferable balance becomes available again
          // we do this by only creating a inscriptionTransfer but without setting the inscription on a new output
          // and we safe the inscription transfer

          await createOrUpdateInscriptionTransfer(
            {
              inscription: inscription,
              tx_id: tx.hash,
              sender: matchingOutput.address,
              receiver: matchingOutput.address, // the sender gets its own inscription back
              block_height: tx.blockNumber,
              isGenesis: false,
              transactionIndex: tx.index,
              input_index: input.index,
            },
            multiRedisClient as unknown as RedisClientType,
            false
          );
        } else {
          // The output hashes are stored in the order they were added, so the output with index 0
          // should be the first one in the list
          const outputHashWithInscription =
            outputHashes[indexOfOutputWithInscription];

          // Fetch the output data
          const output: IOutput | undefined | null = outputHashToUtxo.get(
            outputHashWithInscription
          );

          if (!output) {
            throw new Error(
              `Output ${outputHashWithInscription} not found for tx ${tx.hash}`
            );
          }
          if (output) {
            if (!output.transactionHash)
              throw new Error(
                `No tx hash on output ${outputHashWithInscription}`
              );
            if (!output.hash)
              throw new Error(`No hash on output ${outputHashWithInscription}`);
          } else {
            throw new Error(`Output 0 not found for tx ${tx.hash}`);
          }

          // we update the output of the currently processed tx that holds the sat with the inscription
          const updatedOutput: IOutput = {
            ...output,
            inscriptions: [...(output.inscriptions || []), inscription],
          };

          // we add the hash of the updated output to the set of output hashes that need to be updated
          outputHashesToUpdate.add(updatedOutput.hash);

          // if duplicate inscription throw error
          if (output.inscriptions?.includes(inscription)) {
            throw new Error(
              `Duplicate inscription ${inscription} for tx ${tx.hash}`
            );
          }

          // await setInscriptionOnOutput(
          //   output,
          //   inscription!,
          //   multiRedisClient as unknown as RedisClientType
          // );

          // we update outputHashToUtxo and inputHashToUtxo if the output exists there already
          if (outputHashToUtxo.has(output.hash)) {
            outputHashToUtxo.set(output.hash, updatedOutput);
            // process.exit(1);
          }
          if (inputHashToUtxo.has(output.hash)) {
            inputHashToUtxo.set(output.hash, updatedOutput);
          }

          // and we safe the inscription transfer

          await createOrUpdateInscriptionTransfer(
            {
              inscription: inscription!,
              tx_id: tx.hash,
              sender: matchingOutput.address,
              receiver: output.address,
              block_height: tx.blockNumber,
              isGenesis: false,
              transactionIndex: tx.index,
              input_index: input.index,
            },
            multiRedisClient as unknown as RedisClientType,
            false
          );
        }
      }
    }
  }

  // for every output that needs to be updated we update it
  for (const outputHash of outputHashesToUpdate) {
    const output = outputHashToUtxo.get(outputHash);

    if (!output) {
      throw new Error(`Output ${outputHash} not found`);
    }

    await setInscriptionsOnOutput(
      output,
      output.inscriptions!,
      multiRedisClient as unknown as RedisClientType
    );
  }

  await multiRedisClient.exec();

  inputHashToUtxo.clear();
  outputHashToUtxo.clear();
};
