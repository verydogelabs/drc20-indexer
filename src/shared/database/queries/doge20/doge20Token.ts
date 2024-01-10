import { IDoge20Token } from "../../models/doge20";
import { getRedisClient } from "../../../redis";
import { redisKeys } from "../keyPrefixes";
import Decimal from "decimal.js";

const { TICK_KEY_PREFIX, TICK_KEYS_LIST_PREFIX } = redisKeys;
const getTickKey = (tick: string) => `${TICK_KEY_PREFIX}:${tick.toLowerCase()}`;

const packDataForRedis = (data: IDoge20Token) => {
  // check that not negative or zero
  if (data.max.isNegative() || data.max.isZero()) {
    throw new Error(`packDataForRedis: max cannot be negative or null`);
  }
  if (data.lim.isNegative() || data.lim.isZero()) {
    throw new Error(`packDataForRedis: lim cannot be negative or null`);
  }
  if (data.currentSupply.isNegative()) {
    throw new Error(`packDataForRedis: currentSupply cannot be negative`);
  }

  return JSON.stringify({
    ...data,
    max: data.max.toString(),
    lim: data.lim.toString(),
    currentSupply: data.currentSupply.toString(),
  });
};

const unpackDataFromRedis = (data: string): IDoge20Token => {
  const parsedData = JSON.parse(data);
  return {
    ...parsedData,
    max: new Decimal(parsedData.max),
    lim: new Decimal(parsedData.lim),
    currentSupply: new Decimal(parsedData.currentSupply),
  };
};

const tokenExistsCache = new Map<string, boolean>();

export const checkTokenExistsCached = async ({ tick }: { tick: string }) => {
  const tickKey = getTickKey(tick);

  if (tokenExistsCache.has(tickKey)) {
    return tokenExistsCache.get(tickKey);
  }

  const tokenExists = (await (await getRedisClient()).exists(tickKey)) === 1;

  if (tokenExists) {
    tokenExistsCache.set(tickKey, tokenExists);
  }

  return tokenExists;
};

// "exists" queries
export const checkTokenExists = async ({ tick }: { tick: string }) => {
  const tickKey = getTickKey(tick);

  const tokenExists = await (await getRedisClient()).exists(tickKey);

  return tokenExists === 1;
};

// find
export const findToken = async ({
  tick,
}: {
  tick: string;
}): Promise<IDoge20Token> => {
  const tickKey = getTickKey(tick);

  const tokenString = await (await getRedisClient()).get(tickKey);
  if (!tokenString) {
    throw new Error(`Tick ${tick} not found`);
  }

  return unpackDataFromRedis(tokenString);
};

export const getAllTokens = async (): Promise<IDoge20Token[]> => {
  const redisClient = await getRedisClient();

  // Retrieve ticks from the sorted set
  const ticks = await redisClient.zRange(TICK_KEYS_LIST_PREFIX, 0, -1);

  return await Promise.all(
    ticks.map(async (tick) => {
      const key = getTickKey(tick);
      const tokenString = await redisClient.get(key);
      return unpackDataFromRedis(tokenString as string);
    })
  );
};

// create
export const createDog20Token = async (
  txId: string,
  { tick, max, lim, currentSupply = new Decimal(0), p }: IDoge20Token
) => {
  const redisClient = await getRedisClient();

  // Use tick:<tick> as key
  const tickLower = tick.toLowerCase();
  const tokenKey = getTickKey(tick);

  // Add tick to sorted set (for ordering)
  // Assuming that the order is defined by the time of insertion, we can use the current timestamp as score.
  const score = Date.now();
  await redisClient.zAdd(TICK_KEYS_LIST_PREFIX, [{ score, value: tickLower }]);

  // Create a dog20Token object
  const dog20Token = {
    tick: tickLower,
    max: max,
    lim: lim,
    currentSupply: currentSupply,
    p,
    txId,
  };

  // Set the value in Redis
  await redisClient.set(tokenKey, packDataForRedis(dog20Token));
};

// update
export const updateIncreaseCurrentSupply = async ({
  tick,
  supplyIncrease,
}: {
  tick: string;
  supplyIncrease: string;
}) => {
  const tickKey = getTickKey(tick);
  const redisClient = await getRedisClient();

  const tokenString = await redisClient.get(tickKey);
  if (!tokenString) {
    throw new Error(`Tick ${tick} not found`);
  }

  let tokenData = unpackDataFromRedis(tokenString);
  tokenData.currentSupply = tokenData.currentSupply.plus(supplyIncrease);

  await redisClient.set(tickKey, packDataForRedis(tokenData));
};
