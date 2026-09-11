import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { MIN_SEATS } from "../../src/engine";
import { BOT_DELAY_MS } from "./advance";
import { startRound } from "./advance";
import { closeSession, discardRound, humanSeatCount, isLeaving } from "./session";

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
 *  - not yet committed to the round (trump still open, or their decision pending): the
 *    round is thrown away and dealt again right now, without them;
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
  if (round.phase === "trump" || decision === "pending") {
    await discardRound(ctx, round);
    await startRound(ctx, session._id);
    return;
  }
  if (decision === "in" && round.turnSeat === seat) {
    await ctx.scheduler.runAfter(BOT_DELAY_MS, internal.game.bots.act, { roundId: round._id, nonce: round.turnNonce });
  }
}
