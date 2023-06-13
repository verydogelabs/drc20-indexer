import Decimal from "decimal.js";

// Balance model
export interface IDoge20Balance {
  tick: string;
  available: Decimal;
  transferable: Decimal; // transferable and available together are the total balance
  address: string;
}
