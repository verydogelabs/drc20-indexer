import { DRC_20_SYMBOLS } from "../../shared/config";

type DRC20Symbol = (typeof DRC_20_SYMBOLS)[number];

export enum Doge20TransferType {
  DOGE20_MINT_TRANSFER = "mint-transfer-0",
  DOGE20_TRANSFER_TRANSFER_0 = "transfer-transfer-0",
  DOGE20_TRANSFER_TRANSFER_1 = "transfer-transfer-1",
  DOGE20_DEPLOY_TRANSFER = "deploy-transfer-0",
}

export const doge20TransferTypes = [
  "mint-transfer-0",
  "transfer-transfer-0",
  "transfer-transfer-1",
  "deploy-transfer-0",
];

export interface IDoge20MintData extends IDog20InscriptionTransfer {
  dog20Data: {
    type: Doge20TransferType.DOGE20_MINT_TRANSFER;
    p: DRC20Symbol;
    op: "mint";
    tick: string;
    amt: string;
  };
}

export interface IDoge20TransferData extends IDog20InscriptionTransfer {
  dog20Data: {
    type:
      | Doge20TransferType.DOGE20_TRANSFER_TRANSFER_0
      | Doge20TransferType.DOGE20_TRANSFER_TRANSFER_1;
    p: DRC20Symbol;
    op: "transfer";
    tick: string;
    amt: string;
  };
}

export interface IDoge20DeployData extends IDog20InscriptionTransfer {
  dog20Data: {
    type: Doge20TransferType.DOGE20_DEPLOY_TRANSFER;
    p: DRC20Symbol;
    op: "deploy";
    tick: string;
    max: string;
    lim: string;
  };
}

export interface IDog20InscriptionTransfer {
  inscriptionTransfer: IInscriptionTransferData;
  dog20Data: IDog20Data;
}

export interface IInscriptionTransferData {
  timestamp: Date;
  block_height: number;
  receiver: string;
  tx_id: string;
  inscription: string;
  transactionIndex: number;
  isGenesis: boolean;
  sender?: string;
  input_index: number;
}

export interface IDog20Data {
  type: Doge20TransferType;
  // has to be in DRC_20_SYMBOLS
  p: DRC20Symbol;
  op: "deploy" | "mint" | "transfer";
  tick: string;
  amt?: string;
  max?: string;
  lim?: string;
}
