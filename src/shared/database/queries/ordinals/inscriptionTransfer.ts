import { IInscriptionTransfer } from "../../models/ordinals/InscriptionTransfers";
import { getRedisClient } from "../../../redis";
import { redisKeys } from "../keyPrefixes";

const { INSCRIPTION_TRANSFER_KEY_PREFIX } = redisKeys;

const getInscriptionTransferKey = ({
  tx_id,
  input_index,
  inscription,
}: {
  tx_id: string;
  input_index: string | number;
  inscription: string;
}) => {
  if (!tx_id) throw new Error("tx_id is required");
  if (input_index === undefined || input_index === null)
    throw new Error("input_index is required");
  if (!inscription) throw new Error("inscription is required");
  return `${INSCRIPTION_TRANSFER_KEY_PREFIX}:${tx_id.toLowerCase()}:${String(
    input_index
  )}:${inscription.toLowerCase()}`;
};

const getInscriptionTransfer = async ({
  tx_id,
  input_index,
  inscription,
}: {
  tx_id: string;
  input_index: string;
  inscription: string;
}): Promise<IInscriptionTransfer> => {
  const redisClient = await getRedisClient();
  const inscriptionTransferKey = getInscriptionTransferKey({
    tx_id,
    input_index,
    inscription,
  });
  const inscriptionTransferData = await redisClient.get(inscriptionTransferKey);
  const parsedInscriptionTransferData = JSON.parse(
    inscriptionTransferData as string
  );
  parsedInscriptionTransferData.tx_id = tx_id.toLowerCase();
  return parsedInscriptionTransferData as IInscriptionTransfer;
};

export const getInscriptionTransfersPerBlock = async (
  blockHeight: number
): Promise<IInscriptionTransfer[]> => {
  const redisClient = await getRedisClient();

  // Define the block height key
  const blockHeightKey = `inscTransfersPerBlock:${blockHeight}`;

  // Get all inscription IDs for this block height
  const inscriptionIDs = await redisClient.sMembers(blockHeightKey);
  // we split it into tx_id and input_index
  const inscriptionIDsSplitted = inscriptionIDs.map((id) => {
    const splitted = id.split(":");
    return {
      tx_id: splitted[1],
      input_index: splitted[2],
      inscription: splitted[3],
    };
  });

  // Fetch the inscription transfer data for each ID
  const inscriptionTransfers = await Promise.all(
    inscriptionIDsSplitted.map(async ({ tx_id, input_index, inscription }) => {
      return getInscriptionTransfer({ tx_id, input_index, inscription });
    })
  );

  // Sort the inscription transfers by transactionIndex
  inscriptionTransfers.sort((a, b) => a.transactionIndex - b.transactionIndex);

  return inscriptionTransfers;
};

export const createOrUpdateInscriptionTransfer = async (
  inscriptionTransfer: IInscriptionTransfer
) => {
  const redisClient = await getRedisClient();

  // Define the inscription transfer key using block_height and tx_id
  const inscriptionTransferKey = getInscriptionTransferKey({
    tx_id: inscriptionTransfer.tx_id,
    input_index: inscriptionTransfer.input_index,
    inscription: inscriptionTransfer.inscription,
  });

  // Prepare the data to be stored
  const data = {
    block_height: inscriptionTransfer.block_height,
    receiver: inscriptionTransfer?.receiver?.toLowerCase(),
    inscription: inscriptionTransfer.inscription.toLowerCase(),
    ...(inscriptionTransfer.sender && {
      sender: inscriptionTransfer.sender.toLowerCase(),
    }),
    ...(inscriptionTransfer.isGenesis && { isGenesis: true }),
    transactionIndex: inscriptionTransfer.transactionIndex,
  };

  try {
    // Insert or update the inscription transfer data
    await redisClient.set(inscriptionTransferKey, JSON.stringify(data));

    // Define the block height key and add the inscription transfer id to it
    const blockHeightKey = `inscTransfersPerBlock:${inscriptionTransfer.block_height}`;
    await redisClient.sAdd(blockHeightKey, inscriptionTransferKey);
  } catch (error) {
    console.error("Failed to save or update inscription transfer:", error);
    // Handle the error appropriately
  }
};
