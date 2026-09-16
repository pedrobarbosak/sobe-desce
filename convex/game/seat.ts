import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { MIN_SEATS, withdrawSeat } from "../../src/engine";
import { BOT_DELAY_MS, finalizeRound, setTurn } from "./advance";
import { closeSession, humanSeatCount, isLeaving } from "./session";
import { loadRound, persistRound } from "./state";

/**
 * Hand a seated player's seat to a bot for the rest of the sitting. The roster row keeps its
 * score, so the stand-in inherits the exact points the human had. Reversing it is a new
 * sitting, not a rejoin: the bot holds the seat until the session ends.
 */
export async function handSeatToBot(
  ctx: MutationCtx,
  game: Doc<"games">,
  player: Doc<"gamePlayers">,
  reason: "abandoned" | "kicked" | "disconnected",
): Promise<void> {
  if (player.isBot || player.botControlled === true) return;
  await ctx.db.patch(player._id, { botControlled: true, botReason: reason });
  if (game.status !== "active" || !game.currentSessionId) return;
  const session = await ctx.db.get(game.currentSessionId);
  if (!session || session.status !== "active" || !session.currentRoundId) return;
  const seat = session.seats.indexOf(player._id);
  if (seat < 0) return;
  // A league sitting is a group of people, not a group of bots. Once too few of them are
  // still at the table, call it a night rather than let the bots play the evening out.
  if (game.mode === "campaign" && (await humanSeatCount(ctx, session)) < MIN_SEATS) {
    await closeSession(ctx, session);
    return;
  }
  const round = await ctx.db.get(session.currentRoundId);
  if (!round || round.phase === "scored" || round.turnSeat !== seat) return;
  // The stand-in owes a move right now.
  await ctx.scheduler.runAfter(BOT_DELAY_MS, internal.game.bots.act, {
    roundId: round._id,
    nonce: round.turnNonce,
  });
}

/**
 * Campaign: a person who walks away (or whose tab goes quiet) leaves the sitting; nobody
 * plays on in their name. The seat drops out at the next deal, because a round cannot
 * lose a seat halfway. Until then:
 *  - not yet committed to the round (trump still open, or their decision pending): they
 *    sit this round out, their cards go back under the stock, and the round carries on;
 *  - already in the round: the server plays their remaining cards out for this one round;
 *  - already out of the round: nothing to play, they just wait for the deal.
 * Too few seats left and the night is over.
 */
export async function leaveSitting(ctx: MutationCtx, game: Doc<"games">, player: Doc<"gamePlayers">): Promise<void> {
  if (game.status !== "active" || !game.currentSessionId) return;
  const session = await ctx.db.get(game.currentSessionId);
  if (!session || session.status !== "active") return;
  const seat = session.seats.indexOf(player._id);
  if (seat < 0 || isLeaving(session, player._id)) return;
  if (player.checkedIn) await ctx.db.patch(player._id, { checkedIn: false });
  const leaving = [...(session.leaving ?? []), player._id];
  if (session.seats.length - leaving.length < MIN_SEATS) {
    await closeSession(ctx, session);
    return;
  }
  await ctx.db.patch(session._id, { leaving });
  const round = session.currentRoundId ? await ctx.db.get(session.currentRoundId) : null;
  if (!round || round.phase === "scored") return;
  const decision = round.participants[seat]?.decision ?? "pending";
  if (decision === "pending") {
    await withdrawFromRound(ctx, round._id, seat);
    return;
  }
  if (decision === "in" && round.turnSeat === seat) {
    await ctx.scheduler.runAfter(BOT_DELAY_MS, internal.game.bots.act, { roundId: round._id, nonce: round.turnNonce });
  }
}

/** Sit an undecided seat out of the round in progress, and hand the turn on if it held it. */
async function withdrawFromRound(ctx: MutationCtx, roundId: Id<"rounds">, seat: number): Promise<void> {
  const loaded = await loadRound(ctx, roundId);
  const next = withdrawSeat(loaded.state, seat);
  await persistRound(ctx, loaded, next);
  // Whoever inherits the trump choice has been looking at their three cards all along, so
  // the blind window goes with the handover: hearts in the dark is no longer on offer.
  if (next.phase === "trump" && next.turnSeat !== loaded.round.turnSeat) {
    await ctx.db.patch(roundId, { darkUntil: undefined });
  }
  // The last seat still deciding may have been the one that left, which scores the round.
  if (next.phase === "scored") await finalizeRound(ctx, loaded, next);
  else await setTurn(ctx, roundId, { session: loaded.session, game: loaded.game });
}
