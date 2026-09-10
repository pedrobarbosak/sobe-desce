import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { MIN_SEATS } from "../../src/engine";
import { BOT_DELAY_MS } from "./advance";
import { closeSession, humanSeatCount } from "./session";

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
