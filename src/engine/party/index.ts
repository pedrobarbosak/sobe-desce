/**
 * Party variant: one public twist per round and a private stash of powerups per seat.
 *
 * Everything party-specific lives here. The core reducer knows only that a round may carry
 * a `PartyState`, and asks this module three things: which rules the twist implies, how
 * the round scores, and what a powerup does. Classic rounds never call in.
 */
import { type Card, type Suit, SUITS } from "../cards";
import { TRICKS_PER_ROUND } from "../config";
import type { EngineErrorCode } from "../errors";
import type { Rng } from "../rng";
import { CLASSIC_RULES, type RoundRules } from "../rules";
import type { Decision, Phase } from "../round";
import { roundDeltas, scoreMultiplier } from "../scoring";
import type { CompletedTrick } from "../trick";

export type Twist =
  /** Lowest card wins the trick; the climb rule becomes "go under if you can". */
  | "desce"
  /** A drawn suit doubles the round when it becomes trump, the way hearts always does. */
  | "golden"
  /** The fifth trick is worth three. */
  | "lastTrick"
  /** Winning no tricks pays the penalty out instead of in: everyone plays to lose. */
  | "blankPays"
  /** No trump suit at all: the trump phase is skipped and only the led suit can win. */
  | "noTrump"
  /** Every hand is face up once the trump is settled. */
  | "openHands"
  /** After the discards, everyone still in passes one card to their left. */
  | "passLeft"
  /** Nobody may sit out. */
  | "allIn"
  /** Eight-second turns. */
  | "lightning"
  /** No discards and nobody sits out: you play exactly what you were dealt. */
  | "asDealt";

export const TWISTS: readonly Twist[] = [
  "desce",
  "golden",
  "lastTrick",
  "blankPays",
  "noTrump",
  "openHands",
  "passLeft",
  "allIn",
  "lightning",
  "asDealt",
];

export const LIGHTNING_SECONDS = 8;

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
export const LAST_TRICK_WEIGHT = 3;
export const CURSE_POINTS = 2;

export type Peek = { seat: number; target: number };

export type PartyState = {
  twist: Twist;
  /** Set for the `golden` twist: the suit that doubles the round if it becomes trump. */
  goldenSuit: Suit | null;
  /** PRIVATE: each seat's unused powerups. Only its owner may see it. */
  inventory: Powerup[][];
  /** Public: who cancelled their own blank this round. */
  shielded: boolean[];
  /** Public: curses laid on each seat this round. */
  curses: number[];
  /** Public: who is looking at whose hand. The hand itself is only sent to the peeker. */
  peeks: Peek[];
  /** PRIVATE: the card each seat has chosen to pass left, until everyone has chosen. */
  passes: (Card | null)[];
};

export type PowerupAction = { type: "usePowerup"; seat: number; powerup: Powerup; target?: number };
export type PowerupEvent = { type: "powerupUsed"; seat: number; powerup: Powerup; target?: number };

/** Draw the round's twist from the same seed as the shuffle, so a round replays exactly. */
export function createPartyState(rng: Rng, seatCount: number, inventory: readonly (readonly Powerup[])[]): PartyState {
  const twist = TWISTS[Math.floor(rng() * TWISTS.length)]!;
  // Hearts already doubles on its own; a golden hearts would change nothing.
  const candidates = SUITS.filter((s) => s !== "H");
  const goldenSuit = twist === "golden" ? candidates[Math.floor(rng() * candidates.length)]! : null;
  return {
    twist,
    goldenSuit,
    inventory: Array.from({ length: seatCount }, (_, seat) => [...(inventory[seat] ?? [])]),
    shielded: Array.from({ length: seatCount }, () => false),
    curses: Array.from({ length: seatCount }, () => 0),
    peeks: [],
    passes: Array.from({ length: seatCount }, () => null),
  };
}

export function clonePartyState(p: PartyState): PartyState {
  return {
    ...p,
    inventory: p.inventory.map((i) => [...i]),
    shielded: [...p.shielded],
    curses: [...p.curses],
    peeks: p.peeks.map((k) => ({ ...k })),
    passes: [...p.passes],
  };
}

/** What each twist changes. Anything not mentioned plays as classic. */
export function partyRules(p: Pick<PartyState, "twist">): RoundRules {
  const r = { ...CLASSIC_RULES };
  switch (p.twist) {
    case "desce":
      r.lowWins = true;
      break;
    case "blankPays":
      r.avoidTricks = true;
      break;
    case "noTrump":
      r.noTrump = true;
      break;
    case "openHands":
      r.openHands = true;
      break;
    case "passLeft":
      r.passLeft = true;
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
    case "golden":
    case "lastTrick":
      break;
  }
  return r;
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
 * computed on those, and then the round's twist and any powerups adjust the result.
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
  return results.map((r) => {
    // Sitting out still changes nothing: a curse on a seat that stays out fizzles.
    if (!r.participated) return 0;
    let delta = (base.get(r.seat) ?? 0) * golden;
    if (r.tricksWon === 0) {
      if (party.shielded[r.seat]) delta = 0;
      else if (party.twist === "blankPays") delta = -blank;
    }
    return delta + (party.curses[r.seat] ?? 0) * CURSE_POINTS;
  });
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

/** Seats whose hands `seat` may see through a peek this round. */
export function peekedSeats(p: PartyState, seat: number): number[] {
  return p.peeks.filter((k) => k.seat === seat).map((k) => k.target);
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

export type PublicPartyState = Omit<PartyState, "inventory" | "passes"> & {
  inventorySizes: number[];
  /** Who has already chosen a card to pass. */
  passed: boolean[];
};

export function redactParty(p: PartyState): PublicPartyState {
  const { inventory, passes, ...rest } = p;
  return { ...rest, inventorySizes: inventory.map((i) => i.length), passed: passes.map((c) => c !== null) };
}

/** The cards a viewer may see of another seat's hand: those it has peeked at. */
export function visibleThroughPeeks(p: PartyState, viewer: number, hands: readonly (readonly Card[])[]): { seat: number; cards: Card[] }[] {
  return peekedSeats(p, viewer).map((seat) => ({ seat, cards: [...(hands[seat] ?? [])] }));
}
