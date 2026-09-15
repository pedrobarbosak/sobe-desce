/**
 * What the core reducer asks about the round it is running. Classic play answers with
 * fixed defaults; the party variant derives its answers from the round's twist. Keeping
 * the questions this narrow is what lets party rules grow without touching classic code.
 */
export type RoundRules = {
  /** Lowest card wins the trick, and the climb rule points downward. */
  lowWins: boolean;
  /** The round rewards taking no tricks; bots and the timer play to lose. */
  avoidTricks: boolean;
  /** No suit is trump: the trump phase is skipped and nobody can trump. */
  noTrump: boolean;
  /** Nobody may sit the round out. */
  allIn: boolean;
  /** Discard cap for the round; null keeps the table's. */
  maxDiscard: number | null;
  /** After the discards, everyone still in passes one card to their left. */
  passLeft: boolean;
  /** Seconds per turn; null keeps the table's clock. */
  turnSeconds: number | null;
  /** Every hand is face up once the trump is settled. Enforced by the server. */
  openHands: boolean;
};

export const CLASSIC_RULES: RoundRules = {
  lowWins: false,
  avoidTricks: false,
  noTrump: false,
  allIn: false,
  maxDiscard: null,
  passLeft: false,
  turnSeconds: null,
  openHands: false,
};
