/**
 * Party variant: one public twist per round and a private stash of powerups per seat.
 *
 * Everything party-specific lives here. The core reducer knows only that a round may carry
 * a `PartyState`, and asks this module three things: which rules the twist implies, how
 * the round scores, and what a powerup does. Classic rounds never call in.
 *
 * One invariant shapes every hand-moving twist: HAND_SIZE and TRICKS_PER_ROUND are both
 * five, so anything that moves cards between seats has to be count-preserving. Passes,
 * rotations, one-for-one swaps and the market all are; "steal a card" would not be.
 */
import { type Card, type DeckSize, type Rank, type Suit, SUITS, ranksFor } from "../cards";
import { TRICKS_PER_ROUND } from "../config";
import type { EngineErrorCode } from "../errors";
import type { Rng } from "../rng";
import { CLASSIC_RULES, type PassDirection, type PassSpec, type RoundRules } from "../rules";
import type { Decision, Phase } from "../round";
import { roundDeltas, scoreMultiplier } from "../scoring";
import type { CompletedTrick } from "../trick";

export type Twist =
  /** Lowest card wins the trick; the climb rule becomes "go under if you can". */
  | "desce"
  /** A drawn suit doubles the round when it becomes trump, the way hearts always does. */
  | "golden"
  /** The fifth trick is worth five: a whole perfect round on one card. */
  | "lastTrick"
  /** Winning no tricks pays the penalty out instead of in: everyone plays to lose. */
  | "blankPays"
  /** No trump suit at all: the trump phase is skipped and only the led suit can win. */
  | "noTrump"
  /** After the discards, everyone still in passes cards around the ring. */
  | "pass"
  /** Eight-second turns. */
  | "lightning"
  /** No discards and nobody sits out: you play exactly what you were dealt. */
  | "asDealt"
  /** Once everyone has decided, the hands of those still in may all move round. */
  | "swap"
  /** Everyone secretly guards one other player: sees their hand and takes their result. */
  | "guardian"
  /** No follow-suit, no climb: any card, any time. */
  | "freeForAll"
  /** A drawn rank beats everything, trump included. */
  | "wildRank"
  /** After every trick, the remaining hands move one seat to the left. */
  | "carousel"
  /** Everyone lays one card face up in the middle, then takes one back in turn. */
  | "market"
  /** A spare face-up hand in the middle; each player may swap one card with it. */
  | "dummy"
  /** One random card of every hand is face up for the round. */
  | "faceUp"
  /** Scoring upside down: every trick costs a point and a blank pays the penalty out. */
  | "inverted"
  /** Shelved: every hand face up. The visibility knob stays for other twists. */
  | "openHands"
  /** Shelved: nobody may sit out. "asDealt" still uses the knob. */
  | "allIn";

/** The draw pool. Shelved twists keep their rules but are never dealt. */
export const TWISTS: readonly Twist[] = [
  "desce",
  "golden",
  "lastTrick",
  "blankPays",
  "noTrump",
  "pass",
  "lightning",
  "asDealt",
  "swap",
  "guardian",
  "freeForAll",
  "wildRank",
  "carousel",
  "market",
  "dummy",
  "faceUp",
  "inverted",
];

export const LIGHTNING_SECONDS = 8;
export const LAST_TRICK_WEIGHT = 5;
export const MAX_PASS_COUNT = 2;
export const DUMMY_SIZE = 7;
export const PASS_DIRECTIONS: readonly PassDirection[] = ["left", "right", "across"];

/**
 * Powerups are built and tested but switched off for now: nothing is awarded, so no seat
 * ever holds one, and the table hides the tray. Flip this to bring them back.
 */
export const POWERUPS_ENABLED = false;

export type Powerup =
  /** See a chosen player's hand for the rest of the round. */
  | "peek"
  /** A chosen player takes extra points at the end of the round, if they play it. */
  | "curse"
  /** Your own blank penalty this round is cancelled. */
  | "shield";

export const POWERUPS: readonly Powerup[] = ["peek", "curse", "shield"];
/** A seat never holds more than this; awards beyond it are lost. */
export const MAX_POWERUPS = 2;
export const CURSE_POINTS = 2;

export type Peek = { seat: number; target: number };

export type PartyState = {
  twist: Twist;
  /** `golden`: the suit that doubles the round if it becomes trump. */
  goldenSuit: Suit | null;
  /** `pass`: how many cards and which way. */
  pass: PassSpec | null;
  /** `wildRank`: the rank that beats everything. */
  wildRank: Rank | null;
  /**
   * `swap`: how many seats to the left every hand travels, or 0 when the coin came up
   * "stay put". Private: the table only learns whether the hands moved, and only once the
   * deciding is over and the coin has been tossed.
   */
  swapOffset: number;
  /** `faceUp`: which card of each hand (by index, at the start of the tricks) shows. */
  faceUpIndex: number[];
  /**
   * `guardian`: the seat each seat guards, one big cycle. Public on the round document but
   * the server only tells a seat about its own ward until the round is scored.
   */
  guardians: number[] | null;
  /** `faceUp`: the card showing at each seat, null once played or when none. */
  faceUp: (Card | null)[];
  /** `market`: cards lying face up waiting to be taken. */
  market: Card[];
  /** `market`: who takes in which order. Furthest from zero first. */
  marketOrder: number[];
  /** `dummy`: the spare hand, face up. */
  dummy: Card[];
  /** `dummy`: how many seats have had their go at it. */
  dummyTurn: number;
  /** PRIVATE: each seat's unused powerups. Only its owner may see it. */
  inventory: Powerup[][];
  /** Public: who cancelled their own blank this round. */
  shielded: boolean[];
  /** Public: curses laid on each seat this round. */
  curses: number[];
  /** Public: who is looking at whose hand. The hand itself is only sent to the peeker. */
  peeks: Peek[];
  /** PRIVATE: the cards each seat has chosen to pass, until everyone has chosen. */
  passes: (Card[] | null)[];
};

export type PowerupAction = { type: "usePowerup"; seat: number; powerup: Powerup; target?: number };
export type PowerupEvent = { type: "powerupUsed"; seat: number; powerup: Powerup; target?: number };

function pick<T>(items: readonly T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)]!;
}

/** A single cycle through every seat, so nobody guards themselves and nobody is left over. */
function guardianCycle(seatCount: number, rng: Rng): number[] {
  const order = Array.from({ length: seatCount }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const out = Array.from({ length: seatCount }, () => 0);
  for (let i = 0; i < order.length; i++) out[order[i]!] = order[(i + 1) % order.length]!;
  return out;
}

/**
 * Draw the round's twist from the same seed as the shuffle, so a round replays exactly.
 * The previous round's twist is left out of the draw: the same weather twice running
 * reads as a stuck table rather than luck.
 */
export function createPartyState(
  rng: Rng,
  seatCount: number,
  deck: DeckSize,
  inventory: readonly (readonly Powerup[])[],
  previousTwist: Twist | null = null,
): PartyState {
  // Guardian wants an even table; the previous twist is never dealt twice running.
  const pool = TWISTS.filter((t) => t !== previousTwist && (t !== "guardian" || seatCount % 2 === 0));
  const twist = pick(pool.length > 0 ? pool : TWISTS, rng);
  // Hearts already doubles on its own; a golden hearts would change nothing. The Ace is
  // already the top card, so a wild Ace would change nothing either.
  const goldenSuit = twist === "golden" ? pick(SUITS.filter((s) => s !== "H"), rng) : null;
  const pass: PassSpec | null =
    twist === "pass" ? { count: 1 + Math.floor(rng() * MAX_PASS_COUNT), direction: pick(PASS_DIRECTIONS, rng) } : null;
  const wildRank = twist === "wildRank" ? pick(ranksFor(deck).filter((r) => r !== "A"), rng) : null;
  // Heads the hands move, tails they stay. Draw both so the seed stream is stable.
  const swapCoin = rng() < 0.5;
  const swapStep = 1 + Math.floor(rng() * (seatCount - 1));
  const swapOffset = twist === "swap" && swapCoin ? swapStep : 0;
  const faceUpIndex = Array.from({ length: seatCount }, () => Math.floor(rng() * 5));
  const guardians = twist === "guardian" ? guardianCycle(seatCount, rng) : null;
  const seats = <T,>(make: () => T) => Array.from({ length: seatCount }, make);
  return {
    twist,
    goldenSuit,
    pass,
    wildRank,
    swapOffset,
    faceUpIndex,
    guardians,
    faceUp: seats(() => null),
    market: [],
    marketOrder: [],
    dummy: [],
    dummyTurn: 0,
    inventory: Array.from({ length: seatCount }, (_, seat) => [...(inventory[seat] ?? [])]),
    shielded: seats(() => false),
    curses: seats(() => 0),
    peeks: [],
    passes: seats(() => null),
  };
}

export function clonePartyState(p: PartyState): PartyState {
  return {
    ...p,
    pass: p.pass ? { ...p.pass } : null,
    faceUpIndex: [...p.faceUpIndex],
    guardians: p.guardians ? [...p.guardians] : null,
    faceUp: [...p.faceUp],
    market: [...p.market],
    marketOrder: [...p.marketOrder],
    dummy: [...p.dummy],
    inventory: p.inventory.map((i) => [...i]),
    shielded: [...p.shielded],
    curses: [...p.curses],
    peeks: p.peeks.map((k) => ({ ...k })),
    passes: p.passes.map((c) => (c ? [...c] : null)),
  };
}

/** What each twist changes. Anything not mentioned plays as classic. */
export function partyRules(p: Pick<PartyState, "twist" | "pass" | "wildRank">): RoundRules {
  const r = { ...CLASSIC_RULES };
  switch (p.twist) {
    case "desce":
      r.lowWins = true;
      break;
    case "blankPays":
    case "inverted":
      r.avoidTricks = true;
      break;
    case "noTrump":
      r.noTrump = true;
      break;
    case "openHands":
      r.openHands = true;
      break;
    case "pass":
      r.pass = p.pass ?? { count: 1, direction: "left" };
      break;
    case "allIn":
      r.allIn = true;
      break;
    case "lightning":
      r.turnSeconds = LIGHTNING_SECONDS;
      break;
    case "asDealt":
      r.maxDiscard = 0;
      r.allIn = true;
      break;
    case "swap":
      r.swapHands = true;
      break;
    case "guardian":
      r.guardian = true;
      break;
    case "freeForAll":
      r.freeForAll = true;
      break;
    case "wildRank":
      r.wildRank = p.wildRank;
      break;
    case "carousel":
      r.carousel = true;
      break;
    case "market":
      r.market = true;
      break;
    case "dummy":
      r.dummy = true;
      break;
    case "faceUp":
      r.faceUp = true;
      break;
    case "golden":
    case "lastTrick":
      break;
  }
  return r;
}

/**
 * Where a pass lands: `offset` steps round the ring of seats still in, clockwise from the
 * dealer's left. "Across" is half the ring, which for an odd table is simply a longer step.
 */
export function passOffset(direction: PassDirection, ringSize: number): number {
  switch (direction) {
    case "left":
      return 1;
    case "right":
      return ringSize - 1;
    case "across":
      return Math.floor(ringSize / 2);
  }
}

/** Does the trump make this round count double on top of the usual hearts rule? */
export function isGoldenTrump(p: PartyState, trump: Suit | null): boolean {
  return p.twist === "golden" && p.goldenSuit !== null && trump === p.goldenSuit;
}

export type PartyScoreInput = {
  party: PartyState;
  seats: readonly { decision: Decision; tricksWon: number }[];
  completedTricks: readonly CompletedTrick[];
  trump: Suit | null;
  blankPenalty: number;
  darkHearts: boolean;
};

/**
 * Party scoring wraps classic scoring: tricks are re-weighted first, the classic deltas are
 * computed on those, the round's twist and any powerups adjust the result, and guardians
 * finally take their ward's number instead of their own.
 */
export function partyDeltas(input: PartyScoreInput): number[] {
  const { party, seats, trump, blankPenalty, darkHearts } = input;
  const lastWinner =
    party.twist === "lastTrick" ? input.completedTricks[TRICKS_PER_ROUND - 1]?.winner : undefined;
  const results = seats.map((s, seat) => ({
    seat,
    participated: s.decision === "in",
    tricksWon: s.tricksWon + (lastWinner === seat ? LAST_TRICK_WEIGHT - 1 : 0),
  }));
  const base = roundDeltas(results, trump, blankPenalty, darkHearts);
  const golden = isGoldenTrump(party, trump) ? 2 : 1;
  const blank = blankPenalty * scoreMultiplier(trump, darkHearts) * golden;
  const own = results.map((r) => {
    // Sitting out still changes nothing: a curse on a seat that stays out fizzles.
    if (!r.participated) return 0;
    let delta = (base.get(r.seat) ?? 0) * golden;
    if (r.tricksWon === 0) {
      if (party.shielded[r.seat]) delta = 0;
      else if (party.twist === "blankPays") delta = -blank;
    }
    // Upside down: tricks cost, a blank pays out, and the multiplier still applies.
    if (party.twist === "inverted") delta = -delta;
    return delta + (party.curses[r.seat] ?? 0) * CURSE_POINTS;
  });
  if (!party.guardians) return own;
  return own.map((_, seat) => own[party.guardians![seat]!] ?? 0);
}

export type PowerupContext = {
  phase: Phase;
  seatCount: number;
  decisions: readonly Decision[];
};

/** Why a powerup cannot be used right now, or null when it can. */
export function powerupBlockedReason(p: PartyState, action: PowerupAction, ctx: PowerupContext): EngineErrorCode | null {
  const { seat, powerup, target } = action;
  if (!p.inventory[seat]?.includes(powerup)) return "powerupNotHeld";
  if (ctx.phase !== "discard" && ctx.phase !== "tricks") return "powerupWrongPhase";
  if (ctx.decisions[seat] === "out") return "powerupSatOut";
  switch (powerup) {
    case "shield":
      if (target !== undefined) return "powerupBadTarget";
      if (p.shielded[seat]) return "alreadyShielded";
      return null;
    case "peek":
    case "curse": {
      if (target === undefined || !Number.isInteger(target) || target < 0 || target >= ctx.seatCount || target === seat) {
        return "powerupBadTarget";
      }
      if (ctx.decisions[target] === "out") return "powerupBadTarget";
      if (powerup === "peek" && p.peeks.some((k) => k.seat === seat && k.target === target)) return "alreadyPeeked";
      return null;
    }
  }
}

/** Apply a powerup that `powerupBlockedReason` has already cleared. Mutates `p`. */
export function applyPowerup(p: PartyState, action: PowerupAction): void {
  const stash = p.inventory[action.seat]!;
  stash.splice(stash.indexOf(action.powerup), 1);
  switch (action.powerup) {
    case "shield":
      p.shielded[action.seat] = true;
      return;
    case "peek":
      p.peeks.push({ seat: action.seat, target: action.target! });
      return;
    case "curse":
      p.curses[action.target!] = (p.curses[action.target!] ?? 0) + 1;
      return;
  }
}

/** Seats whose hands `seat` may see: through a peek, or as the guardian of a ward. */
export function visibleSeats(p: PartyState, seat: number): number[] {
  const out = p.peeks.filter((k) => k.seat === seat).map((k) => k.target);
  const ward = p.guardians?.[seat];
  if (ward !== undefined && ward !== seat && !out.includes(ward)) out.push(ward);
  return out;
}

export type AwardInput = {
  /** Scores after the round was applied, by seat. */
  scores: readonly number[];
  /** The round's deltas, by seat. */
  deltas: readonly number[];
  participated: readonly boolean[];
  tricksWon: readonly number[];
  inventory: readonly (readonly Powerup[])[];
  rng: Rng;
};

export type Award = { seat: number; powerup: Powerup };

/**
 * Catch-up: after every round the seat furthest from zero draws a powerup, and so does
 * anyone who played and paid a blank. A full stash draws nothing.
 */
export function awardPowerups(input: AwardInput): { inventory: Powerup[][]; awards: Award[] } {
  const inventory = input.inventory.map((i) => [...i]);
  const awards: Award[] = [];
  const furthest = Math.max(...input.scores);
  const give = (seat: number) => {
    const stash = inventory[seat]!;
    if (stash.length >= MAX_POWERUPS) return;
    const powerup = POWERUPS[Math.floor(input.rng() * POWERUPS.length)]!;
    stash.push(powerup);
    awards.push({ seat, powerup });
  };
  for (let seat = 0; seat < input.scores.length; seat++) {
    const blanked = input.participated[seat] && input.tricksWon[seat] === 0 && (input.deltas[seat] ?? 0) > 0;
    if (input.scores[seat] === furthest || blanked) give(seat);
  }
  return { inventory, awards };
}

export type PublicPartyState = Omit<PartyState, "inventory" | "passes" | "guardians" | "swapOffset"> & {
  inventorySizes: number[];
  /** Who has already chosen their cards to pass. */
  passed: boolean[];
};

/**
 * Everything but the private bits. The guardian cycle is the round's reveal and stays out
 * until the round is scored; the swap step stays out for good, the server derives a plain
 * "did they move" once the coin is tossed.
 */
export function redactParty(p: PartyState): PublicPartyState {
  const { inventory, passes, guardians: _guardians, swapOffset: _swapOffset, ...rest } = p;
  return { ...rest, inventorySizes: inventory.map((i) => i.length), passed: passes.map((c) => c !== null) };
}

/** The cards a viewer may see of other seats' hands: peeked at, or their ward's. */
export function visibleHands(p: PartyState, viewer: number, hands: readonly (readonly Card[])[]): { seat: number; cards: Card[] }[] {
  return visibleSeats(p, viewer).map((seat) => ({ seat, cards: [...(hands[seat] ?? [])] }));
}
