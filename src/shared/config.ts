import dotenv from "dotenv";
dotenv.config();

export const ORDINALS_BASE_URL = process.env.ORDINALS_BASE_URL || "";
export const START_BLOCK = parseInt(process.env.START_BLOCK || "0");
export const STARTUP_BLOCK = process.env.STARTUP_BLOCK
  ? parseInt(process.env.STARTUP_BLOCK)
  : 0;
export const END_BLOCK = process.env.END_BLOCK
  ? parseInt(process.env.END_BLOCK)
  : undefined;
export const ORDINALS_API_BASE_URL = process.env.ORDINALS_API_BASE_URL || "";
export const DRC_20_SYMBOLS = process.env.DRC_20_SYMBOLS?.split(",") || [];
export const SPREADSHEET_ID = process.env.SPREADSHEET_ID || "";
export const DAEMON = process.env.DAEMON === "true";
export const REDIS_URL = process.env.REDIS_URL || "";
export const USE_REDIS_SOCK = process.env.USE_REDIS_SOCK === "true";
export const REDIS_PATH = process.env.REDIS_PATH || "";
export const REDIS_USERNAME = process.env.REDIS_USERNAME || "default";
export const REDIS_PASSWORD =
  process.env.REDIS_PASSWORD ||
  "ZiTZMiD9bp3eCjMkdfaGpEayTjgxRW2V6BnMNr3CVNhqzCMkgybcTj";
export const DISABLE_SPREADSHEET = process.env.DISABLE_SPREADSHEET === "true";
// slow down mode is used to slow down the indexer to being able to switch fast in case of reorgs
export const SLOW_DOWN_MODE = process.env.SLOW_DOWN_MODE === "true";
export const SLOW_DOWN_MODE_BLOCK_COUNT = parseInt(
  process.env.SLOW_DOWN_MODE_BLOCK_COUNT || "100"
);
