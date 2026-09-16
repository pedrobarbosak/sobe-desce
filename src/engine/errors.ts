export type EngineErrorCode =
  | "notYourTurn"
  | "wrongPhase"
  | "invalidSuit"
  | "cardNotInHand"
  | "duplicateCards"
  | "tooManyDiscards"
  | "illegalPlay"
  | "alreadyDecided"
  | "sitOutBelowThreshold"
  | "sitOutMaxConsecutive"
  | "sitOutClubs"
  | "sitOutTrumpNamer"
  | "sitOutAllIn"
  | "alreadyPassed"
  | "wrongPassCount"
  | "cardNotInMarket"
  | "cardNotInDummy"
  | "dummyNeedsBoth"
  | "stockEmpty"
  | "darkHeartsTooFewPoints"
  | "invalidSeat"
  | "notPartyTable"
  | "powerupNotHeld"
  | "powerupWrongPhase"
  | "powerupSatOut"
  | "powerupBadTarget"
  | "alreadyPeeked"
  | "alreadyShielded"
  | "alreadyVoted"
  | "markedCardStays"
  | "sitOutMarked";

export class EngineError extends Error {
  constructor(public readonly code: EngineErrorCode, message?: string) {
    super(message ?? code);
    this.name = "EngineError";
  }
}
