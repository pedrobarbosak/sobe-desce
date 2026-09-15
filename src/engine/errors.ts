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
  | "stockEmpty"
  | "darkHeartsTooFewPoints"
  | "invalidSeat"
  | "notPartyTable"
  | "powerupNotHeld"
  | "powerupWrongPhase"
  | "powerupSatOut"
  | "powerupBadTarget"
  | "alreadyPeeked"
  | "alreadyShielded";

export class EngineError extends Error {
  constructor(public readonly code: EngineErrorCode, message?: string) {
    super(message ?? code);
    this.name = "EngineError";
  }
}
