import { IInscriptionTransfer } from "../../../shared/database/models/ordinals/InscriptionTransfers";
import {
  IDog20Data,
  Doge20TransferType,
  IDoge20MintData,
  IDoge20TransferData,
  IDoge20DeployData,
} from "../../indexer/types";

export const transformToDoge20InscriptionTransfer = ({
  inscriptionTransfer,
  dog20Data,
  numOfPreviousInscriptionTransfers,
}: {
  inscriptionTransfer: IInscriptionTransfer;
  dog20Data: IDog20Data;
  numOfPreviousInscriptionTransfers: number;
}) => {
  const inscriptionTransferType = `${dog20Data.op}-transfer-${numOfPreviousInscriptionTransfers}`;

  if (inscriptionTransferType === Doge20TransferType.DOGE20_MINT_TRANSFER) {
    return {
      inscriptionTransfer,
      dog20Data: {
        ...dog20Data,
        type: Doge20TransferType.DOGE20_MINT_TRANSFER,
      },
    } as IDoge20MintData;
  }
  if (
    inscriptionTransferType === Doge20TransferType.DOGE20_TRANSFER_TRANSFER_0
  ) {
    return {
      inscriptionTransfer,
      dog20Data: {
        ...dog20Data,
        type: Doge20TransferType.DOGE20_TRANSFER_TRANSFER_0,
      },
    } as IDoge20TransferData;
  }
  if (
    inscriptionTransferType === Doge20TransferType.DOGE20_TRANSFER_TRANSFER_1
  ) {
    return {
      inscriptionTransfer,
      dog20Data: {
        ...dog20Data,
        type: Doge20TransferType.DOGE20_TRANSFER_TRANSFER_1,
      },
    } as IDoge20TransferData;
  }
  if (inscriptionTransferType === Doge20TransferType.DOGE20_DEPLOY_TRANSFER) {
    return {
      inscriptionTransfer,
      dog20Data: {
        ...dog20Data,
        type: Doge20TransferType.DOGE20_DEPLOY_TRANSFER,
      },
    } as IDoge20DeployData;
  }
  throw new Error("Invalid inscription transfer type");
};
