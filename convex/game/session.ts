import { discardCapFor } from "../../src/engine";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { deleteRoundDeep } from "./cleanup";

/**
 * Score a round in progress as a blank: nobody played it out, so inventing a result would
 * be worse than dropping it. The timer is not cancelled (this may run from inside a
 * scheduled function); the nonce bump makes it a no-op.
 */
export async function voidRound(ctx: MutationCtx, round: Doc<"rounds">): Promise<void> {
  if (round.phase === "scored") return;
  await ctx.db.patch(round._id, {
    phase: "scored",
    turnSeat: null,
    turnNonce: round.turnNonce + 1,
    turnDeadline: undefined,
    timerId: undefined,
    deltas: round.participants.map(() => 0),
    scoredAt: Date.now(),
  });
}

/** Throw a round away as if it had never been dealt: hands, secrets, log and all. */
export async function discardRound(ctx: MutationCtx, round: Doc<"rounds">): Promise<void> {
  await deleteRoundDeep(ctx, round._id);
  await ctx.db.patch(round.sessionId, { currentRoundId: undefined });
}

/**
 * End a sitting. A round still in progress is abandoned rather than scored. Rounds already
 * scored keep their points, which live on the roster.
 */
export async function closeSession(ctx: MutationCtx, session: Doc<"sessions">): Promise<void> {
  if (session.status !== "active") return;
  const round = session.currentRoundId ? await ctx.db.get(session.currentRoundId) : null;
  if (round) await voidRound(ctx, round);
  await ctx.db.patch(session._id, { status: "finished", endedAt: Date.now() });
  await ctx.db.patch(session.gameId, { currentSessionId: undefined });
  for (const playerId of session.seats) {
    const player = await ctx.db.get(playerId);
    if (player?.checkedIn) await ctx.db.patch(playerId, { checkedIn: false });
  }
}

/** Whether this seat's player has left the sitting and is only waiting for the next deal to drop out. */
export function isLeaving(session: Doc<"sessions">, playerId: Doc<"gamePlayers">["_id"]): boolean {
  return session.leaving?.includes(playerId) ?? false;
}

/** Seats still answering to a person, rather than to a stand-in bot. */
export async function humanSeatCount(ctx: MutationCtx, session: Doc<"sessions">): Promise<number> {
  let n = 0;
  for (const playerId of session.seats) {
    if (isLeaving(session, playerId)) continue;
    const player = await ctx.db.get(playerId);
    if (!player || player.isBot || player.botControlled === true) continue;
    if (player.status !== "active" || player.userId === undefined) continue;
    n++;
  }
  return n;
}

/**
 * Take the players who left out of the seating, between rounds. Everybody else keeps their
 * relative place and their sit-out streak; the deal keeps rotating from where it was, and
 * the discard cap follows the new head count.
 */
export async function applyLeaving(ctx: MutationCtx, session: Doc<"sessions">, game: Doc<"games">): Promise<Doc<"sessions">> {
  const leaving = new Set(session.leaving ?? []);
  if (leaving.size === 0) return session;
  const keep = session.seats.map((_, i) => i).filter((i) => !leaving.has(session.seats[i]!));
  const seats = keep.map((i) => session.seats[i]!);
  const sitOutStreak = keep.map((i) => session.sitOutStreak[i] ?? 0);
  // The dealer button stays with its holder; if they left, it sits just before the next
  // seat round from them, so the usual "one to the left" step lands on the right person.
  let dealerSeat = keep.indexOf(session.dealerSeat);
  if (dealerSeat < 0) {
    const next = keep.findIndex((i) => i > session.dealerSeat);
    dealerSeat = ((next < 0 ? 0 : next) - 1 + seats.length) % seats.length;
  }
  const patch = {
    seats,
    seatCount: seats.length,
    sitOutStreak,
    dealerSeat,
    maxDiscard: discardCapFor(game.config.deck, seats.length) ?? session.maxDiscard,
    leaving: undefined,
  };
  await ctx.db.patch(session._id, patch);
  return { ...session, ...patch };
}
