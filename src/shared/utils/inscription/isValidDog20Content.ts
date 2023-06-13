import { IDog20Data } from "../../../dog20Indexing/indexer/types";
import { DRC_20_SYMBOLS } from "../../config";

export const isValidDog20Format = (content: any): content is IDog20Data => {
  // checking for content type
  if (typeof content !== "object" || content === null || Array.isArray(content))
    return false;

  // checking for required protocol#
  if (!DRC_20_SYMBOLS.includes(content.p)) return false;

  // checking for required op
  if (!["deploy", "mint", "transfer"].includes(content.op)) return false;

  // checking for tick
  if (typeof content.tick !== "string") return false;

  // checking for mint- and transfer-dependent fields
  if (["mint", "transfer"].includes(content.op)) {
    if (typeof content.amt !== "string" || !/^\d+(\.\d+)?$/.test(content.amt))
      return false;
  }

  // checking for deploy-dependent fields
  if (content.op === "deploy") {
    if (typeof content.max !== "string" || !/^\d+(\.\d+)?$/.test(content.max))
      return false;
    if (typeof content.lim !== "string" || !/^\d+(\.\d+)?$/.test(content.lim))
      return false;
  }

  return true;
};
