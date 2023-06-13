import {
  IDoge20Token,
  IDoge20InscriptionTransfer,
} from "../../../shared/database/models/doge20";
import {
  checkTokenExists,
  createDog20Token,
  findToken,
  checkUserHasBalance,
  increaseAvailableBalance,
  createBalance,
  updateIncreaseCurrentSupply,
  checkAvailableBalance,
  shiftAvailableToTransferableBalance,
  checkTransferableBalance,
  findPreviousNonIgnoredInscriptionTransfers,
} from "../../../shared/database/queries/doge20";
import { decreaseTransferableBalance } from "../../../shared/database/queries/doge20/balance";
import {
  saveInscriptionTransfer,
  ignoreAndSaveInscriptionTransfer,
} from "../../utils/inscriptionTransfer";
import { IDog20InscriptionTransfer, Doge20TransferType } from "../types";
import { Decimal } from "../../../shared/utils/other/Decimal";

export const processDoge20Inscription = async (
  dog20InscriptionTransfer: IDog20InscriptionTransfer
) => {
  // if max, lim or amt exist we parse them as Decimal and check that they are not negative
  if (
    dog20InscriptionTransfer.dog20Data.max &&
    new Decimal(dog20InscriptionTransfer.dog20Data.max).isNegative()
  )
    console.error("max cannot be negative");
  if (
    dog20InscriptionTransfer.dog20Data.lim &&
    new Decimal(dog20InscriptionTransfer.dog20Data.lim).isNegative()
  )
    throw new Error("lim cannot be negative");
  if (
    dog20InscriptionTransfer.dog20Data.amt &&
    new Decimal(dog20InscriptionTransfer.dog20Data.amt).isNegative()
  )
    throw new Error("amt cannot be negative");

  // if max, lim or amt exist we check their length is not more than 20 (see src/shared/utils/other/Decimal.ts)
  if (
    dog20InscriptionTransfer.dog20Data.max &&
    dog20InscriptionTransfer.dog20Data.max.length > 20
  ) {
    console.log(dog20InscriptionTransfer);
    console.error("max cannot be more than 20 characters");
  }
  if (
    dog20InscriptionTransfer.dog20Data.lim &&
    dog20InscriptionTransfer.dog20Data.lim.length > 20
  ) {
    console.log(dog20InscriptionTransfer);
    console.error("lim cannot be more than 20 characters");
  }
  if (
    dog20InscriptionTransfer.dog20Data.amt &&
    dog20InscriptionTransfer.dog20Data.amt.length > 20
  ) {
    console.log(dog20InscriptionTransfer);
    console.error("amt cannot be more than 20 characters");
  }

  // OP DEPLOY
  if (
    dog20InscriptionTransfer.dog20Data.type ===
    Doge20TransferType.DOGE20_DEPLOY_TRANSFER
  ) {
    if (
      dog20InscriptionTransfer.dog20Data.max &&
      dog20InscriptionTransfer.dog20Data.max.length > 20
    ) {
      await ignoreAndSaveInscriptionTransfer(
        dog20InscriptionTransfer.inscriptionTransfer,
        "max cannot be more than 20 characters"
      );
      return;
    }

    if (
      dog20InscriptionTransfer.dog20Data.max &&
      (new Decimal(dog20InscriptionTransfer.dog20Data.max).isNegative() ||
        new Decimal(dog20InscriptionTransfer.dog20Data.max).isZero())
    ) {
      await ignoreAndSaveInscriptionTransfer(
        dog20InscriptionTransfer.inscriptionTransfer,
        "max cannot be negative or null"
      );
      return;
    }

    if (
      dog20InscriptionTransfer.dog20Data.lim &&
      (new Decimal(dog20InscriptionTransfer.dog20Data.lim).isNegative() ||
        new Decimal(dog20InscriptionTransfer.dog20Data.lim).isZero())
    ) {
      await ignoreAndSaveInscriptionTransfer(
        dog20InscriptionTransfer.inscriptionTransfer,
        "lim cannot be negative or null"
      );
      return;
    }

    // check if already deployed
    const isAlreadyDeployed = await checkTokenExists({
      tick: dog20InscriptionTransfer.dog20Data.tick.toLowerCase(),
    });

    // if not deployed: create doge-20-token
    if (!isAlreadyDeployed) {
      if (
        !dog20InscriptionTransfer.dog20Data.max ||
        !dog20InscriptionTransfer.dog20Data.lim
      ) {
        throw new Error("max and lim must be defined");
      }

      await createDog20Token(
        dog20InscriptionTransfer.inscriptionTransfer.tx_id,
        {
          tick: dog20InscriptionTransfer.dog20Data.tick.toLowerCase(),
          max: new Decimal(dog20InscriptionTransfer.dog20Data.max),
          lim: new Decimal(dog20InscriptionTransfer.dog20Data.lim),
          currentSupply: new Decimal(0),
          p: dog20InscriptionTransfer.dog20Data.p,
        }
      );
      saveInscriptionTransfer(dog20InscriptionTransfer.inscriptionTransfer, {
        availableBalanceChange: new Decimal(0),
        transferableBalanceChange: new Decimal(0),
      });
      return;
    } else {
      await ignoreAndSaveInscriptionTransfer(
        dog20InscriptionTransfer.inscriptionTransfer,
        "tick already deployed"
      );
      return;
    }
  }
  // OP MINT
  else if (
    dog20InscriptionTransfer.dog20Data.type ===
    Doge20TransferType.DOGE20_MINT_TRANSFER
  ) {
    if (!dog20InscriptionTransfer.dog20Data.amt) {
      throw new Error("amt must be defined");
    }

    // check if token is deployed
    const isTokenDeployed = await checkTokenExists({
      tick: dog20InscriptionTransfer.dog20Data.tick,
    });

    if (!isTokenDeployed) {
      await ignoreAndSaveInscriptionTransfer(
        dog20InscriptionTransfer.inscriptionTransfer,
        "tick not deployed " +
          dog20InscriptionTransfer.dog20Data.tick.toLowerCase()
      );
      return;
    }

    const token = (await findToken({
      tick: dog20InscriptionTransfer.dog20Data.tick,
    })) as IDoge20Token;

    // check if below limit of doge-20-token
    const isBelowLimit = new Decimal(
      dog20InscriptionTransfer.dog20Data.amt
    ).lte(token.lim);
    if (!isBelowLimit) {
      await ignoreAndSaveInscriptionTransfer(
        dog20InscriptionTransfer.inscriptionTransfer,
        "above limit"
      );
      return;
    }

    // check if there is suppy left to mint
    const isSupplyLeft = token.currentSupply.lt(token.max);
    if (!isSupplyLeft) {
      await ignoreAndSaveInscriptionTransfer(
        dog20InscriptionTransfer.inscriptionTransfer,
        "above max supply"
      );
      return;
    }

    // we add the minimum of 1. the mint amount and 2. the supply left
    const amt = new Decimal(dog20InscriptionTransfer.dog20Data.amt);
    const maxSupply = new Decimal(token.max);
    const currentSupply = new Decimal(token.currentSupply);

    const amountToBeMinted = Decimal.min(amt, maxSupply.minus(currentSupply));

    // check if the user already has a balance for that tick
    const isBalanceAlreadyExisting = await checkUserHasBalance({
      tick: dog20InscriptionTransfer.dog20Data.tick,
      address: dog20InscriptionTransfer.inscriptionTransfer.receiver,
    });

    if (isBalanceAlreadyExisting) {
      // update available balance
      increaseAvailableBalance({
        tick: dog20InscriptionTransfer.dog20Data.tick.toLowerCase(),
        address: dog20InscriptionTransfer.inscriptionTransfer.receiver,
        amountToBeAdded: new Decimal(amountToBeMinted),
      });
    } else {
      // create balance
      await createBalance({
        tick: dog20InscriptionTransfer.dog20Data.tick.toLowerCase(),
        address: dog20InscriptionTransfer.inscriptionTransfer.receiver,
        available: amountToBeMinted,
        transferable: new Decimal(0),
      });
    }

    // update current supply
    await updateIncreaseCurrentSupply({
      tick: dog20InscriptionTransfer.dog20Data.tick,
      supplyIncrease: amountToBeMinted.toString(),
    });
    await saveInscriptionTransfer(
      dog20InscriptionTransfer.inscriptionTransfer,
      {
        availableBalanceChange: amountToBeMinted,
        transferableBalanceChange: new Decimal(0),
      }
    );
    return;
  }
  // OP TRANFSER | INSCRIBE
  else if (
    dog20InscriptionTransfer.dog20Data.type ===
    Doge20TransferType.DOGE20_TRANSFER_TRANSFER_0
  ) {
    if (!dog20InscriptionTransfer.dog20Data.amt) {
      throw new Error("amt must be defined");
    }

    // check if token is deployed
    const isTokenDeployed = await checkTokenExists({
      tick: dog20InscriptionTransfer.dog20Data.tick,
    });

    if (!isTokenDeployed) {
      await ignoreAndSaveInscriptionTransfer(
        dog20InscriptionTransfer.inscriptionTransfer,
        "tick not deployed " +
          dog20InscriptionTransfer.dog20Data.tick.toLowerCase()
      );
      return;
    }

    // check if the user already has available balance for that tick ; if not ignore
    const enoughAvailableBalance = await checkAvailableBalance({
      tick: dog20InscriptionTransfer.dog20Data.tick.toLowerCase(),
      amountToBeTransferred: new Decimal(
        dog20InscriptionTransfer.dog20Data.amt!
      ),
      address: dog20InscriptionTransfer.inscriptionTransfer.receiver,
    });

    if (!enoughAvailableBalance) {
      await ignoreAndSaveInscriptionTransfer(
        dog20InscriptionTransfer.inscriptionTransfer,
        "not enough available balance"
      );
      return;
    }

    // update available balance
    await shiftAvailableToTransferableBalance({
      tick: dog20InscriptionTransfer.dog20Data.tick.toLowerCase(),
      address: dog20InscriptionTransfer.inscriptionTransfer.receiver,
      amountToBeShifted: new Decimal(dog20InscriptionTransfer.dog20Data.amt),
    });
    await saveInscriptionTransfer(
      dog20InscriptionTransfer.inscriptionTransfer,
      {
        availableBalanceChange: new Decimal(
          `-${dog20InscriptionTransfer.dog20Data.amt}`
        ),
        transferableBalanceChange: new Decimal(
          dog20InscriptionTransfer.dog20Data.amt
        ),
      }
    );
    return;
  }
  // OP TRANSFER | TRANSFER
  else if (
    dog20InscriptionTransfer.dog20Data.type ===
    Doge20TransferType.DOGE20_TRANSFER_TRANSFER_1
  ) {
    if (!dog20InscriptionTransfer.dog20Data.amt) {
      throw new Error("amt must be defined");
    }

    // check if token is deployed
    const isTokenDeployed = await checkTokenExists({
      tick: dog20InscriptionTransfer.dog20Data.tick,
    });

    if (!isTokenDeployed) {
      await ignoreAndSaveInscriptionTransfer(
        dog20InscriptionTransfer.inscriptionTransfer,
        "tick not deployed " +
          dog20InscriptionTransfer.dog20Data.tick.toLowerCase()
      );
      return;
    }

    // check if the sender already has enough transferable balance for that tick ; if not ignore
    if (!dog20InscriptionTransfer.inscriptionTransfer.sender) {
      throw new Error(
        `sender is undefined for inscriptioTransfer with tx_id ${dog20InscriptionTransfer.inscriptionTransfer.tx_id}`
      );
    }
    const hasEnoughTransferableBalance = await checkTransferableBalance({
      tick: dog20InscriptionTransfer.dog20Data.tick.toLowerCase(),
      amountToBeTransferred: new Decimal(
        dog20InscriptionTransfer.dog20Data.amt!
      ),
      address: dog20InscriptionTransfer.inscriptionTransfer.sender,
    });

    if (!hasEnoughTransferableBalance) {
      await ignoreAndSaveInscriptionTransfer(
        dog20InscriptionTransfer.inscriptionTransfer,
        "not enough transferable balance"
      );
      return;
    }

    // get the sender and update transferable balance of sender
    const prevValidInscriptionTransfer =
      (await findPreviousNonIgnoredInscriptionTransfers({
        inscription: dog20InscriptionTransfer.inscriptionTransfer.inscription,
      })) as IDoge20InscriptionTransfer[];

    if (prevValidInscriptionTransfer.length === 0) {
      await ignoreAndSaveInscriptionTransfer(
        dog20InscriptionTransfer.inscriptionTransfer,
        "There is one valid previous inscription transfer, but it is not valid"
      );
      return;
    } else if (prevValidInscriptionTransfer.length > 1) {
      throw new Error("More than one valid inscription transfer found");
    }
    const sender = prevValidInscriptionTransfer[0].receiver;

    await decreaseTransferableBalance({
      tick: dog20InscriptionTransfer.dog20Data.tick,
      address: sender,
      amountToBeSubtracted: new Decimal(
        dog20InscriptionTransfer.dog20Data.amt!
      ),
    });

    // update available balance of receiver (address)

    const isBalanceAlreadyExisting = await checkUserHasBalance({
      tick: dog20InscriptionTransfer.dog20Data.tick,
      address: dog20InscriptionTransfer.inscriptionTransfer.receiver,
    });
    if (!isBalanceAlreadyExisting) {
      await createBalance({
        tick: dog20InscriptionTransfer.dog20Data.tick,
        address: dog20InscriptionTransfer.inscriptionTransfer.receiver,
        available: new Decimal(dog20InscriptionTransfer.dog20Data.amt),
        transferable: new Decimal(0),
      });
    } else {
      await increaseAvailableBalance({
        tick: dog20InscriptionTransfer.dog20Data.tick.toLowerCase(),
        address: dog20InscriptionTransfer.inscriptionTransfer.receiver,
        amountToBeAdded: new Decimal(dog20InscriptionTransfer.dog20Data.amt!),
      });
    }

    await saveInscriptionTransfer(
      dog20InscriptionTransfer.inscriptionTransfer,
      {
        availableBalanceChange: new Decimal(0),
        transferableBalanceChange: new Decimal(
          dog20InscriptionTransfer.dog20Data.amt
        ),
      }
    );
    return;
  } else {
    throw new Error("Invalid inscription transfer type");
  }
};
