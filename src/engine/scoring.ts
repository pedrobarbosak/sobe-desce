import type { Suit } from "./cards";

export type SeatResult = { seat: number; participated: boolean; tricksWon: number };

/** Hearts doubles the round. Hearts called before seeing a single card quadruples it. */
export function scoreMultiplier(trump: Suit, darkHearts = false): number {
  if (trump !== "H") return 1;
  return darkHearts ? 4 : 2;
}

/**
 * Deltas per seat for one round: -1 per trick, +blankPenalty for playing and winning none,
 * 0 for sitting out, all times the trump multiplier.
 */
export function roundDeltas(
  results: readonly SeatResult[],
  trump: Suit,
  blankPenalty: number,
  darkHearts = false,
): Map<number, number> {
  const mult = scoreMultiplier(trump, darkHearts);
  const out = new Map<number, number>();
  for (const r of results) {
    if (!r.participated) {
      out.set(r.seat, 0);
    } else if (r.tricksWon === 0) {
      out.set(r.seat, blankPenalty * mult);
    } else {
      out.set(r.seat, -r.tricksWon * mult);
    }
  }
  return out;
}

export type ScoreApplyResult = {
  scores: Map<number, number>;
  /** Seat that reached 0 this round, if any. */
  winner: number | undefined;
};

/**
 * Apply deltas with the overshoot rule: anyone who would go below 0 lands on 0 and wins.
 * If several seats reach 0 in the same round, the lowest pre-clamp score wins; ties go to
 * the seat that comes first in `playOrder` (clockwise from the dealer's left).
 */
export function applyDeltas(
  scores: ReadonlyMap<number, number>,
  deltas: ReadonlyMap<number, number>,
  playOrder: readonly number[],
): ScoreApplyResult {
  const next = new Map<number, number>();
  let winner: number | undefined;
  let winnerRaw = Number.POSITIVE_INFINITY;
  for (const seat of playOrder) {
    const before = scores.get(seat) ?? 0;
    const raw = before + (deltas.get(seat) ?? 0);
    next.set(seat, Math.max(0, raw));
    if (raw <= 0 && raw < winnerRaw) {
      winner = seat;
      winnerRaw = raw;
    }
  }
  for (const [seat, score] of scores) if (!next.has(seat)) next.set(seat, score);
  return { scores: next, winner };
}
