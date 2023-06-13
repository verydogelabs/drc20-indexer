import { IDog20Data } from "../../../../dog20Indexing/indexer/types";

// Define a TypeScript interface for the Inscription model
export interface IInscription {
  inscriptionId: string;
  content?: IDog20Data | null | string;
  genesisTx: string;
}
