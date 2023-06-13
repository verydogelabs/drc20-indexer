import Decimal from "decimal.js";

// Doge-20-Token-Model model
export interface IDoge20Token {
  tick: string;
  max: Decimal;
  lim: Decimal;
  currentSupply: Decimal;
  p: string;
}

export interface IDoge20TokenDoc extends Document, IDoge20Token {}
