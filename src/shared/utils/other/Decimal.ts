import { Decimal } from "decimal.js";
Decimal.set({ precision: 100 }); // we set the precision to 100 but we throw an error if the length of a amount reaches more than 20, which is the longest number we know that unisat processed so far: https://ordinals.com/inscription/c84e874f8b2a0e4fc7673c43cab25a2ad08122dd73364e5b0e39b80777e81782i0
export { Decimal };
