import { IInscriptionTransfer } from "../../../shared/database/models/ordinals/InscriptionTransfers";
import { createIgnoredInscriptionTransfer } from "../../../shared/database/queries/doge20";
import { RedisClientType } from "redis";

export const ignoreAndSaveInscriptionTransfer = async (
  inscriptionTransfer: IInscriptionTransfer,
  reasonForIgnore: string,
  redisClient: RedisClientType
) => {
  await createIgnoredInscriptionTransfer(
    {
      block_height: inscriptionTransfer.block_height,
      receiver: inscriptionTransfer.receiver!,
      tx_id: inscriptionTransfer.tx_id,
      inscription: inscriptionTransfer.inscription,
      transactionIndex: inscriptionTransfer.transactionIndex,
      reasonForIgnore,
    },
    redisClient
  );
};
