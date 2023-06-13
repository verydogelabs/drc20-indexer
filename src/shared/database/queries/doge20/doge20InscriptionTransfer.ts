import { getRedisClient } from "../../../redis";
import { Decimal } from "../../../utils/other/Decimal";
import { redisKeys } from "../keyPrefixes";

const {
  D20_TRANSFERS_KEY_PREFIX,
  D20_INSCR_RECEIVED_PER_ADDRESS_KEY_PREFIX,
  D20_INSCR_SENT_PER_ADDRESS_KEY_PREFIX,
} = redisKeys;

interface I20TransferData {
  tx_id: string;
  receiver: string;
  timestamp: Date;
  block_height: number;
  isIgnored: boolean;
  transactionIndex: number;
  reasonForIgnore?: string;
}

const getTransferKey = (inscription: string) =>
  `${D20_TRANSFERS_KEY_PREFIX}:${inscription.toLowerCase()}`;

const getD20InscrSentPerAddressKey = ({ address }: { address: string }) =>
  `${D20_INSCR_SENT_PER_ADDRESS_KEY_PREFIX}:${address.toLowerCase()}`;

const getD20InscrReceivedPerAddressKey = ({ address }: { address: string }) =>
  `${D20_INSCR_RECEIVED_PER_ADDRESS_KEY_PREFIX}:${address.toLowerCase()}`;

const setup = async ({ inscription }: { inscription: string }) => ({
  redisClient: await getRedisClient(),
  queryKey: getTransferKey(inscription),
});

export const checkDuplicateInscriptionTransfer = async ({
  tx_id,
  inscription,
}: {
  tx_id: string;
  inscription: string;
}): Promise<boolean> => {
  const { redisClient, queryKey } = await setup({ inscription });

  // check if tx_id is already in the set
  return await redisClient.hExists(queryKey, tx_id.toLowerCase());
};

const getInscriptionTransfers = async ({
  inscription,
}: {
  inscription: string;
}): Promise<I20TransferData[]> => {
  const { redisClient, queryKey } = await setup({ inscription });

  const inscriptionTransfers = await redisClient.hGetAll(queryKey);
  // the keys are the tx_ids
  const keys = Object.keys(inscriptionTransfers);

  // the values are the transfer data
  const values = Object.values(inscriptionTransfers);

  return values.map((transfer, i) => ({
    ...JSON.parse(transfer),
    tx_id: keys[i],
    inscription: inscription.toLowerCase(),
  }));
};

export const findPreviousInscriptionTransfers = async ({
  inscription,
}: {
  inscription: string;
}): Promise<I20TransferData[]> => {
  return await getInscriptionTransfers({ inscription });
};

export const findPreviousNonIgnoredInscriptionTransfers = async ({
  inscription,
}: {
  inscription: string;
}): Promise<I20TransferData[]> => {
  return (await getInscriptionTransfers({ inscription })).filter(
    (transfer: I20TransferData) => !transfer.isIgnored
  );
};

const createInscriptionTransfer = async ({
  block_height,
  inscription,
  tx_id,
  receiver,
  transactionIndex,
  isIgnored,
  reasonForIgnore,
  sender,
  transferableBalanceChange,
  availableBalanceChange,
}: {
  block_height: number;
  inscription: string;
  tx_id: string;
  receiver: string;
  transactionIndex: number;
  isIgnored: boolean;
  reasonForIgnore?: string;
  sender?: string;
  transferableBalanceChange?: Decimal; // from sender perspective
  availableBalanceChange?: Decimal; // from sender perspective
}): Promise<void> => {
  const { redisClient, queryKey } = await setup({ inscription });

  if (isIgnored && !reasonForIgnore) {
    throw new Error(
      "If an inscription transfer is ignored, a reason for ignore must be provided"
    );
  }

  const transferData = {
    ...(receiver && { receiver: receiver.toLowerCase() }),
    ...(sender && { sender: sender.toLowerCase() }),
    block_height,
    isIgnored,
    transactionIndex,
    ...(reasonForIgnore && { reasonForIgnore }),
    ...(transferableBalanceChange && { tbc: transferableBalanceChange }),
    ...(availableBalanceChange && { abc: availableBalanceChange }),
  };

  const stringifiedTransferData = JSON.stringify(transferData);

  await redisClient.hSet(
    queryKey,
    tx_id.toLowerCase(),
    stringifiedTransferData
  );

  // received per address
  const queryReceivedPerAddressKey = getD20InscrReceivedPerAddressKey({
    address: receiver,
  });
  await redisClient.hSet(
    queryReceivedPerAddressKey,
    tx_id.toLowerCase(),
    inscription
  );

  if (sender) {
    const querySentPerAddressKey = getD20InscrSentPerAddressKey({
      address: sender,
    });

    // sent per address
    await redisClient.hSet(
      querySentPerAddressKey,
      tx_id.toLowerCase(),
      inscription
    );
  }
};

export const createNonIgnoredInscriptionTransfer = async ({
  block_height,
  inscription,
  tx_id,
  receiver,
  transactionIndex,
  sender,
  transferableBalanceChange,
  availableBalanceChange,
}: {
  block_height: number;
  inscription: string;
  tx_id: string;
  receiver: string;
  transactionIndex: number;
  sender?: string;
  transferableBalanceChange: Decimal;
  availableBalanceChange: Decimal;
}): Promise<void> => {
  await createInscriptionTransfer({
    block_height,
    inscription,
    tx_id,
    receiver,
    transactionIndex,
    isIgnored: false,
    sender: sender,
    transferableBalanceChange,
    availableBalanceChange,
  });
};

export const createIgnoredInscriptionTransfer = async ({
  block_height,
  inscription,
  tx_id,
  receiver,
  reasonForIgnore,
  transactionIndex,
}: {
  block_height: number;
  inscription: string;
  tx_id: string;
  receiver: string;
  reasonForIgnore: string;
  transactionIndex: number;
}): Promise<void> => {
  await createInscriptionTransfer({
    block_height,
    inscription,
    tx_id,
    receiver,
    transactionIndex,
    isIgnored: true,
    reasonForIgnore,
  });
};
