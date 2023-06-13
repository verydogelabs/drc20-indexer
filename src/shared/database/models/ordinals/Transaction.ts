import { IInput } from "../../../../ordinalsIndexing/dataProvider/ordinals";

// Define a TypeScript interface for the Transaction model
export interface ITransaction {
  hash: string;
  blockNumber: number;
  index: number; // index within the block
  outputsFetched?: boolean;
  timestamp: Date;
  inputs?: IInput[];
}
