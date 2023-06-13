// Define a TypeScript interface for the Output model
export interface IOutput {
  transactionHash: string;
  value: number;
  hash: string;
  index: number; // index within the transaction
  address?: string;
  blockNumber: number;
  inscriptions?: string[]; // inscriptionIds
  transactionIndex: number; // the index of the transaction within the block
}
