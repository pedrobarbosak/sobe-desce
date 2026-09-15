import type { Rank } from "./cards";

export type PassDirection = "left" | "right" | "across";
/** How many cards go, and which way round the ring of seats still in the round. */
export type PassSpec = { count: number; direction: PassDirection };

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
  /** Seconds per turn; null keeps the table's clock. */
  turnSeconds: number | null;
  /** Every hand is face up once the trump is settled. Enforced by the server. */
  openHands: boolean;
  /** After the discards, everyone still in passes cards around the ring. */
  pass: PassSpec | null;
  /** After the discards, everyone lays one card face up and then takes one back in turn. */
  market: boolean;
  /** A spare face-up hand that each player may swap one card with before the tricks. */
  dummy: boolean;
  /** After the discards, the hands of the seats still in may rotate. */
  swapHands: boolean;
  /** After every trick, each remaining hand moves one seat to the left. */
  carousel: boolean;
  /** One random card of every hand is face up for the round. */
  faceUp: boolean;
  /** No follow-suit and no climb rule: any card, any time. */
  freeForAll: boolean;
  /** Cards of this rank beat everything, trump included; the first one played wins ties. */
  wildRank: Rank | null;
  /** Each seat is secretly assigned another and scores that seat's delta. */
  guardian: boolean;
};

export const CLASSIC_RULES: RoundRules = {
  lowWins: false,
  avoidTricks: false,
  noTrump: false,
  allIn: false,
  maxDiscard: null,
  turnSeconds: null,
  openHands: false,
  pass: null,
  market: false,
  dummy: false,
  swapHands: false,
  carousel: false,
  faceUp: false,
  freeForAll: false,
  wildRank: null,
  guardian: false,
};
