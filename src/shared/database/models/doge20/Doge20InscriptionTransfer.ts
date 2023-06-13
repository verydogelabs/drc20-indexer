// Doge-20-Inscription-Transfer-Model model
export interface IDoge20InscriptionTransfer extends Document {
  timestamp: Date;
  block_height: number;
  inscription: string;
  tx_id: string;
  receiver: string;
  isIgnored: boolean;
  isGenesis: boolean; // if it was the genesis inscription
  reasonForIgnore?: string;
  transactionIndex: number; // the index of the transaction within the block
}
