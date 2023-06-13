export type StatusName =
  | "getAndProcessDoge20TokensSyncToSpreadsheet"
  | "fetchBlockAndWriteTxsToDb"
  | "createInscriptionTransfers"
  | "getAndProcessInscriptionTransfers"
  | "startup";

export interface IStatus {
  name: StatusName;
  lastSyncedBlock: number;
}
