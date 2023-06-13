import { IInscriptionTransfer } from "../../../shared/database/models/ordinals/InscriptionTransfers";
import { createNonIgnoredInscriptionTransfer } from "../../../shared/database/queries/doge20";
import { Decimal } from "../../../shared/utils/other/Decimal";

export const saveInscriptionTransfer = async (
  inscriptionTransfer: IInscriptionTransfer,
  {
    transferableBalanceChange,
    availableBalanceChange,
  }: { transferableBalanceChange: Decimal; availableBalanceChange: Decimal }
) => {
  await createNonIgnoredInscriptionTransfer({
    block_height: inscriptionTransfer.block_height,
    receiver: inscriptionTransfer.receiver!,
    tx_id: inscriptionTransfer.tx_id,
    inscription: inscriptionTransfer.inscription,
    transactionIndex: inscriptionTransfer.transactionIndex,
    sender: inscriptionTransfer.sender,
    transferableBalanceChange,
    availableBalanceChange,
  });
};
