import { IDoge20Balance } from "../../models/doge20/Doge20Balance";
import { getRedisClient } from "../../../redis";
import { redisKeys } from "../keyPrefixes";
import { Decimal } from "../../../utils/other/Decimal";

const {
  USER_BALANCE_KEY_PREFIX,
  TICK_BALANCE_KEY_PREFIX,
  TICK_HOLDERS_KEY_PREFIX,
} = redisKeys;

const getUserBalanceKey = (address: string) =>
  `${USER_BALANCE_KEY_PREFIX}:${address.toLowerCase()}`;

const getTickBalanceKey = (tick: string) =>
  `${TICK_BALANCE_KEY_PREFIX}:${tick.toLowerCase()}`;

const getTickHoldersKey = () => {
  return `${TICK_HOLDERS_KEY_PREFIX}`;
};

const setUp = async ({ address, tick }: { address: string; tick: string }) => ({
  userBalanceKey: getUserBalanceKey(address),
  tickBalanceKey: getTickBalanceKey(tick),
  tickHoldersKey: getTickHoldersKey(),
  redisClient: await getRedisClient(),
});

interface IBalance {
  transferable: Decimal;
  available: Decimal;
}
const packBalanceDataForRedis = ({
  transferable,
  available,
}: IBalance): string => {
  // check if below 0 and throw error if so
  if (transferable.isNegative() || available.isNegative()) {
    throw new Error(
      `Balance cannot be negative. Transferable: ${transferable.toString()}, Available: ${available.toString()}`
    );
  }
  return JSON.stringify({
    transferable: transferable.toString(),
    available: available.toString(),
  });
};

const unpackBalanceDataFromRedis = (balanceData: string): IBalance => {
  const { transferable, available } = JSON.parse(balanceData);
  return {
    transferable: new Decimal(transferable),
    available: new Decimal(available),
  };
};

/*
mapping: user => balance (number)
- HSET key field value for create / updates
- HGET for reading
- Format: key field value
  - key: b:address (lowercase)
  - field: tick (lowercase)
  - value: {transferable: x, available: y}

mapping: tick => userAddress (string) => balance (number)
- HSET key field value for create / updates
- HGET for reading
- Format: key field value
  - key: tickbalance:tick (lowercase)
  - field: address (lowercase)
  - value: balance (number)

mapping tick => numberOfUsers (number)
*/

// "exists" queries
export const checkUserHasBalance = async ({
  address,
  tick,
}: {
  address: string;
  tick: string;
}): Promise<boolean> => {
  const balanceKey = getUserBalanceKey(address);

  // Check if the key exists in Redis and return
  return await (await getRedisClient()).hExists(balanceKey, tick.toLowerCase());
};

export const checkTransferableBalance = async ({
  address,
  amountToBeTransferred,
  tick,
}: {
  address: string;
  amountToBeTransferred: Decimal;
  tick: string;
}): Promise<boolean> => {
  const { userBalanceKey, redisClient } = await setUp({ address, tick });

  // Fetch the balance data from Redis
  const balanceData: string | undefined = await redisClient.hGet(
    userBalanceKey,
    tick.toLowerCase()
  );

  // If the balance doesn't exist, return false
  if (!balanceData) {
    return false;
  }

  // Parse the balance data and check if the transferable balance is greater than or equal to the amount to be transferred
  const balance: IBalance = unpackBalanceDataFromRedis(balanceData);

  return balance.transferable.gte(amountToBeTransferred);
};

export const checkAvailableBalance = async ({
  address,
  amountToBeTransferred,
  tick,
}: {
  address: string;
  amountToBeTransferred: Decimal;
  tick: string;
}) => {
  const { userBalanceKey, redisClient } = await setUp({ address, tick });

  // Fetch the balance data from Redis
  const balanceData: string | undefined = await redisClient.hGet(
    userBalanceKey,
    tick.toLowerCase()
  );

  // If the balance doesn't exist, return false
  if (!balanceData) {
    return false;
  }

  // Parse the balance data and check if the available balance is greater than or equal to the amount to be transferred
  const balance: IBalance = unpackBalanceDataFromRedis(balanceData);
  return balance.available.gte(amountToBeTransferred);
};

// create user balance for that tick
// create tick balance for that user
// increment number of users for that tick
export const createBalance = async ({
  address,
  tick,
  available,
  transferable,
}: IDoge20Balance) => {
  const { userBalanceKey, tickBalanceKey, tickHoldersKey, redisClient } =
    await setUp({ address, tick });

  const stringifiedBalance: string = packBalanceDataForRedis({
    available: new Decimal(available),
    transferable: new Decimal(transferable),
  });

  const multi = redisClient.multi();

  // create user balance for that tick
  await multi.hSet(userBalanceKey, tick.toLowerCase(), stringifiedBalance);

  // create tick balance for that user
  await multi.hSet(tickBalanceKey, address.toLowerCase(), stringifiedBalance);

  // increment holders of users for that tick
  await multi.hIncrBy(tickHoldersKey, tick.toLowerCase(), 1);

  await multi.exec();
};

// increment available user balance for that tick
// increment available tick balance for that user
export const increaseAvailableBalance = async ({
  address,
  amountToBeAdded,
  tick,
}: {
  address: string;
  amountToBeAdded: Decimal;
  tick: string;
}) => {
  const { userBalanceKey, tickBalanceKey, redisClient } = await setUp({
    address,
    tick,
  });

  // Fetch the user balance, update it and write it again
  let oldUserBalanceDataStr: string | undefined = await redisClient.hGet(
    userBalanceKey,
    tick.toLowerCase()
  );

  if (!oldUserBalanceDataStr) {
    throw new Error(
      `User balance not found for address: ${address} and tick: ${tick}`
    );
  }
  const unpackedUserBalanceData: IBalance = unpackBalanceDataFromRedis(
    oldUserBalanceDataStr
  );
  const updatedUserBalanceDataStr: string = packBalanceDataForRedis({
    available: unpackedUserBalanceData.available.add(amountToBeAdded),
    transferable: unpackedUserBalanceData.transferable,
  });

  const multi = redisClient.multi();

  await multi.hSet(
    userBalanceKey,
    tick.toLowerCase(),
    updatedUserBalanceDataStr
  );

  // Fetch the tick balance, update it and write it again
  let oldTickBalanceDataStr: string | undefined = await redisClient.hGet(
    tickBalanceKey,
    address.toLowerCase()
  );
  if (!oldTickBalanceDataStr) {
    throw new Error(
      `Tick Balance not found for address: ${address} and tick: ${tick}`
    );
  }
  const unpackedTickBalanceData: IBalance = unpackBalanceDataFromRedis(
    oldTickBalanceDataStr
  );
  const updatedTickBalanceDataStr: string = packBalanceDataForRedis({
    available: unpackedTickBalanceData.available.add(amountToBeAdded),
    transferable: unpackedTickBalanceData.transferable,
  });
  await multi.hSet(
    tickBalanceKey,
    address.toLowerCase(),
    updatedTickBalanceDataStr
  );

  await multi.exec();
};

// increment transferable user balance and decrement available user balance for that tick
// increment transferable tick balance and decrement available tick balance for that user
export const shiftAvailableToTransferableBalance = async ({
  address,
  amountToBeShifted,
  tick,
}: {
  address: string;
  amountToBeShifted: Decimal;
  tick: string;
}) => {
  const { userBalanceKey, tickBalanceKey, redisClient } = await setUp({
    address,
    tick,
  });

  // Fetch the user balance, update it and write it again
  let oldUserBalanceDataStr: string | undefined = await redisClient.hGet(
    userBalanceKey,
    tick.toLowerCase()
  );
  if (!oldUserBalanceDataStr) {
    throw new Error(
      `User balance not found for address: ${address} and tick: ${tick}`
    );
  }
  const unpackedUserBalanceData: IBalance = unpackBalanceDataFromRedis(
    oldUserBalanceDataStr
  );
  const newUserBalanceDataStr: string = packBalanceDataForRedis({
    available: unpackedUserBalanceData.available.minus(amountToBeShifted),
    transferable: unpackedUserBalanceData.transferable.add(amountToBeShifted),
  });
  await redisClient.hSet(
    userBalanceKey,
    tick.toLowerCase(),
    newUserBalanceDataStr
  );

  // Fetch the tick balance, update it and write it again
  let tickBalanceDataStr: string | undefined = await redisClient.hGet(
    tickBalanceKey,
    address.toLowerCase()
  );
  if (!tickBalanceDataStr) {
    throw new Error(
      `Tick Balance not found for address: ${address} and tick: ${tick}`
    );
  }
  const unpackedTickBalanceData: IBalance =
    unpackBalanceDataFromRedis(tickBalanceDataStr);

  const newTickBalanceDataStr: string = packBalanceDataForRedis({
    available: unpackedTickBalanceData.available.minus(amountToBeShifted),
    transferable: unpackedTickBalanceData.transferable.add(amountToBeShifted),
  });

  await redisClient.hSet(
    tickBalanceKey,
    address.toLowerCase(),
    newTickBalanceDataStr
  );
};

// decrement transferable user balance for that tick
// decrement transferable tick balance for that user
export const decreaseTransferableBalance = async ({
  address,
  amountToBeSubtracted,
  tick,
}: {
  address: string;
  amountToBeSubtracted: Decimal;
  tick: string;
}) => {
  const { userBalanceKey, tickBalanceKey, tickHoldersKey, redisClient } =
    await setUp({
      address,
      tick,
    });

  // Fetch the user balance,
  // if the transferable and the available balance would be 0 after the update we delete the entry
  // otherwise we update it and write it again
  let userBalanceDataStr: string | undefined = await redisClient.hGet(
    userBalanceKey,
    tick.toLowerCase()
  );
  if (!userBalanceDataStr) {
    throw new Error(
      `User balance not found for address: ${address} and tick: ${tick}`
    );
  }

  const { available, transferable } =
    unpackBalanceDataFromRedis(userBalanceDataStr);

  const availableAfterUpdate = available;
  const transferableAfterUpdate = transferable.minus(amountToBeSubtracted);

  if (availableAfterUpdate.lt(0) || transferableAfterUpdate.lt(0)) {
    throw new Error(
      `User balance would be negative for address: ${address} and tick: ${tick}`
    );
  }

  const multi = redisClient.multi();
  if (availableAfterUpdate.equals(0) && transferableAfterUpdate.equals(0)) {
    await multi.hDel(userBalanceKey, tick.toLowerCase());
    await multi.hDel(tickBalanceKey, address.toLowerCase());
    await multi.hIncrBy(tickHoldersKey, tick.toLowerCase(), -1);
  } else {
    const newUserBalanceDataStr: string = packBalanceDataForRedis({
      available,
      transferable: transferable.minus(amountToBeSubtracted),
    });

    console.log("newUserBalanceDataStr", newUserBalanceDataStr);

    await multi.hSet(userBalanceKey, tick.toLowerCase(), newUserBalanceDataStr);

    // update the tick balance
    let tickBalanceDataStr: string | undefined = await redisClient.hGet(
      tickBalanceKey,
      address.toLowerCase()
    );
    if (!tickBalanceDataStr) {
      throw new Error(
        `Tick Balance not found for address: ${address} and tick: ${tick}`
      );
    }

    const tickBalanceData: IBalance =
      unpackBalanceDataFromRedis(tickBalanceDataStr);

    const newTickBalanceDataStr: string = packBalanceDataForRedis({
      available: tickBalanceData.available,
      transferable: tickBalanceData.transferable.minus(amountToBeSubtracted),
    });

    await multi.hSet(
      tickBalanceKey,
      address.toLowerCase(),
      newTickBalanceDataStr
    );
  }
  await multi.exec();
};
