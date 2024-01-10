import { IDog20Data } from "../../../../dog20Indexing/indexer/types";
import { IInscription } from "../../models/ordinals/Inscription";
import { getRedisClient } from "../../../redis";
import { isValidDog20Format } from "../../../utils/inscription/isValidDog20Content";
import { redisKeys } from "../keyPrefixes";
import { RedisClientType } from "redis";

const { INSCRIPTION_KEY_PREFIX } = redisKeys;

const getInscriptionKey = (inscriptionId: string) =>
  `${INSCRIPTION_KEY_PREFIX}:${inscriptionId.toLowerCase()}`;

const setup = async (inscriptionId: string) => ({
  inscriptionKey: getInscriptionKey(inscriptionId),
  redisClient: await getRedisClient(),
});

export async function createOrUpdateInscription(inscription: IInscription) {
  const { inscriptionKey, redisClient } = await setup(
    inscription.inscriptionId
  );

  // Prepare the data to be stored
  if (
    inscription.inscriptionId.toLowerCase() !==
    inscription.genesisTx.toLowerCase() + "i0"
  )
    throw new Error(
      `Inscription ID does not match genesisTx + i0 for ${inscription.inscriptionId}`
    );
  const data = {
    content: inscription.content,
  };

  try {
    // Insert or update the inscription data
    await redisClient.set(inscriptionKey, JSON.stringify(data));
  } catch (error) {
    console.error("Failed to create or update inscription:", error);
  }
}

export async function getInscriptionContentsBulk(
  inscriptionIds: string[],
  redisClient: RedisClientType
): Promise<(IDog20Data | null)[]> {
  const inscriptionKeys = inscriptionIds.map((inscriptionId) =>
    getInscriptionKey(inscriptionId)
  );
  if (inscriptionKeys.length === 0) return [];
  const inscriptionData = await redisClient.mGet(inscriptionKeys);
  return inscriptionData.map((data: string | null) => {
    if (!data) return null;
    const inscription = JSON.parse(data as string);
    if (!inscription.content || inscription.content === "error") return null;
    const inscriptionContent = JSON.parse(inscription.content);
    if (!isValidDog20Format(inscriptionContent)) {
      return null;
    }
    return JSON.parse(inscription.content) as IDog20Data;
  });
}

// returns object
export async function getInscriptionContent(
  inscriptionId: string
): Promise<IDog20Data | undefined> {
  const { inscriptionKey, redisClient } = await setup(inscriptionId);

  // Fetch the inscription data
  const inscriptionData = await redisClient.get(inscriptionKey);

  if (inscriptionData) {
    try {
      const inscription = JSON.parse(inscriptionData);
      if (!inscription.content || inscription.content === "error")
        return undefined;
      const inscriptionContent = JSON.parse(inscription.content);
      if (!isValidDog20Format(inscriptionContent)) {
        return undefined;
      }
      return JSON.parse(inscription.content) as IDog20Data;
    } catch (error) {
      const inscriptionData = await redisClient.get(inscriptionKey);
      const inscription = JSON.parse(inscriptionData as string);
      console.log(inscription);

      console.error(error);
      console.log(inscription.content);
    }
  } else {
    console.log(
      `Inscription not found or inscription.content invalid: ${inscriptionId}`
    );
  }
}
