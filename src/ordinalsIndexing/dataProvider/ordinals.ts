import axios, { AxiosInstance } from "axios";
import * as cheerio from "cheerio";
import { IInscription } from "../../shared/database/models/ordinals/Inscription";
import { ITransaction } from "../../shared/database/models/ordinals/Transaction";
import { IOutput } from "../../shared/database/models/ordinals/Output";
import he from "he";
import { ORDINALS_BASE_URL } from "../../shared/config";
import { retry } from "../../shared/utils/retry";

const api: AxiosInstance = axios.create({
  baseURL: ORDINALS_BASE_URL,
});

export interface BlockTransactionData {
  txIds: string[];
  timestamp: Date;
  transactionDatas: TransactionData[];
}
export interface IInput {
  hash: string;
  index: number;
  blockNumber: number;
  transactionHash: string;
}
export interface TransactionData {
  txId: string;
  transaction: ITransaction;
  inputs: {
    hash: string;
    index: number;
    blockNumber: number;
    transactionHash: string;
  }[];
  outputs: IOutput[];
  genesisInscription?: IInscription;
}

let blockCounter = 0;
export async function getBlockTransactionsInklData(
  blockNumber: number
): Promise<BlockTransactionData> {
  try {
    console.log(`Fetching block ${blockNumber}...`);

    const response = await api.get(`/block/${blockNumber}`);

    const $ = cheerio.load(response.data);
    const txIds: string[] = [];

    const timestampText = $(
      "dl:first dt:contains('timestamp') + dd time"
    ).text();
    const timestamp = new Date(timestampText);

    const transactionDatas: TransactionData[] = [];

    $("ul.monospace a.monospace").each((i, el) => {
      const txId = $(el).text().trim();
      txIds.push(txId);

      const transactionIndex = i;

      const inscription = $(el).data("inscription-id") as string;
      let inscriptionContent: string | undefined = undefined;
      let inscriptionContentType: string | undefined = undefined;
      if (inscription) {
        try {
          const inscriptionContentTypeDecoded = $(el).data(
            "inscription-content-type"
          ) as string;
          const inscriptionContentDecoded = $(el).data(
            "inscription-content"
          ) as string;

          // Assuming he.decode(inscriptionContentTypeDecoded) returns a string
          let decodedString = he.decode(inscriptionContentTypeDecoded).trim();
          if (
            decodedString.startsWith("text/plain") ||
            decodedString.startsWith("application/json")
          ) {
            inscriptionContentType = he.decode(inscriptionContentTypeDecoded);
            inscriptionContent = he.decode(inscriptionContentDecoded);
            JSON.parse(inscriptionContent); // we parse to make sure it's valid JSON
          }
        } catch (error) {
          inscriptionContentType = "error";
          inscriptionContent = "error";
        }
      }

      const inputsData = $(el).data("inputs") as string;

      const inputs: IInput[] = inputsData
        ? inputsData.split(",").map((input, j) => {
            return {
              hash: input,
              index: j,
              blockNumber: Number(blockNumber),
              transactionHash: txId,
            };
          })
        : [];

      const outputAddressesData = $(el).data("output-addresses") as string;
      const outputAddresses: string[] = outputAddressesData
        ? outputAddressesData.split(",")
        : [];

      const outputsData = $(el).data("outputs") as string;

      const outputsValuesData = String($(el).data("output-values")) as string;
      const outputsValues: number[] = outputsValuesData.split(",").map(Number);
      if (outputsValues.length !== outputsData.split(",").length) {
        throw new Error(`Output values mismatch for tx ${txId}`);
      }
      const outputs: IOutput[] = outputsData
        ? outputsData.split(",").map((output, j) => {
            if (j !== Number(output.split(":")[1]))
              throw new Error("Output index mismatch");
            return {
              transactionHash: txId,
              hash: output,
              index: j,
              address: outputAddresses[j],
              blockNumber: Number(blockNumber),
              value: outputsValues[j],
              ...(inscription && { inscription }),
              transactionIndex: Number(transactionIndex),
            };
          })
        : [];

      transactionDatas.push({
        txId,
        inputs,
        outputs,
        transaction: {
          hash: txId,
          blockNumber: Number(blockNumber),
          index: Number(transactionIndex),
          timestamp,
        },
        ...(inscription && {
          genesisInscription: {
            inscriptionId: txId + "i0",
            genesisTx: txId,
            content: inscriptionContent,
          },
        }),
      });
    });

    blockCounter++;
    console.log(`Fetched block ${blockNumber} (${blockCounter})`);
    return { txIds, timestamp, transactionDatas };
  } catch (error) {
    console.error(
      `Error fetching transactions for block ${blockNumber}: ${error}`
    );
    throw error;
  }
}

export async function getChainhead(): Promise<number> {
  try {
    const response = await api.get("/");
    const $ = cheerio.load(response.data);
    const chainHead = $("ol.blocks").attr("start");
    return Number(chainHead);
  } catch (error) {
    console.error(`Error fetching chainhead: ${error}`);
    throw error;
  }
}

type utxoReturn = {
  value: number;
  address: string;
};
export async function getUtxoValue(hash: string): Promise<utxoReturn> {
  const res = await api.get(`/output/${hash}`);
  const $ = cheerio.load(res.data);

  const value = $('dt:contains("value")').next().text();
  const address = $('dt:contains("address")').next().text();

  if (!value || !address)
    throw new Error(`Error fetching utxo value for ${hash}`);

  return { value: Number(value), address };
}

// map from hash to utxoReturn
const hashToUtxoReturn = new Map<string, utxoReturn>();

export async function getUtxoValueCached(hash: string): Promise<utxoReturn> {
  if (hashToUtxoReturn.has(hash)) {
    const utxoReturn = hashToUtxoReturn.get(hash)!;
    return utxoReturn;
  }

  const txHash = hash.split(":")[0];

  const res = await retry(
    async () => await api.get(`/tx/${txHash}`),
    1000,
    1000
  );

  const $ = cheerio.load(res.data);

  const outputElements = $("ul.monospace > li");

  outputElements.each((index, element) => {
    const value = $(element).find("dd").first().text().trim();
    const address = $(element).find("dd").last().text().trim();
    hashToUtxoReturn.set(txHash + ":" + index, {
      value: Number(value),
      address,
    });
  });

  const utxoReturn = hashToUtxoReturn.get(hash)!;

  if (!utxoReturn) throw new Error(`Error fetching utxo value for ${hash}`);

  // if the map is larger than 10000, delete it
  if (hashToUtxoReturn.size > 10_000_000) {
    hashToUtxoReturn.clear();
  }

  return utxoReturn;
}
