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
  | "stockEmpty"
  | "darkHeartsTooFewPoints"
  | "invalidSeat";

export class EngineError extends Error {
  constructor(public readonly code: EngineErrorCode, message?: string) {
    super(message ?? code);
    this.name = "EngineError";
  }
}
