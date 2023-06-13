export interface IInscriptionTransfer {
  block_height: number;
  input_index: number;
  inscription: string;
  tx_id: string;
  receiver?: string;
  sender?: string; // only relevant if really a transfer happened
  isGenesis: boolean; // if it was the genesis inscription
  transactionIndex: number; // the index of the transaction within the block
}
