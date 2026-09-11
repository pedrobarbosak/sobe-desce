import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { type MutationCtx, type QueryCtx, internalMutation, mutation } from "./_generated/server";
import { setTurn } from "./game/advance";
import { handSeatToBot } from "./game/seat";
import { requireUser } from "./lib/auth";

export const PRESENCE_TTL_MS = 40_000;
/**
 * No heartbeat for this long while seated and a bot plays the seat until the tab comes
 * back. Generous on purpose: a phone that locks or a tab pushed to the background stops
 * its timers for a while without the person having gone anywhere.
 */
export const SEAT_TAKEOVER_MS = 150_000;
export const SWEEP_INTERVAL_MS = 15_000;

/** Whether a tab of theirs has checked in on this game recently. */
export async function isOnline(ctx: QueryCtx | MutationCtx, gameId: Id<"games">, userId: Id<"users">): Promise<boolean> {
  const seen = await ctx.db
    .query("presence")
    .withIndex("by_game_user", (q) => q.eq("gameId", gameId).eq("userId", userId))
    .unique();
  return seen !== null && Date.now() - seen.lastSeenAt < PRESENCE_TTL_MS;
}

export const heartbeat = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("presence")
      .withIndex("by_game_user", (q) => q.eq("gameId", gameId).eq("userId", user._id))
      .unique();
    const now = Date.now();
    if (existing) {
      // Only write when it matters, to keep subscriptions quiet.
      if (now - existing.lastSeenAt > 5_000) await ctx.db.patch(existing._id, { lastSeenAt: now });
    } else {
      await ctx.db.insert("presence", { gameId, userId: user._id, lastSeenAt: now });
    }
    await reclaimSeat(ctx, gameId, user._id);
  },
});

/**
 * A seat handed to a bot because the tab went quiet goes back to the person the moment
 * their tab reports in again. Seats given up on purpose (abandoned, kicked) stay with the
 * bot. If it is their turn right now the clock restarts, and the bot move queued for the
 * old turn is dropped by the nonce check.
 */
async function reclaimSeat(ctx: MutationCtx, gameId: Id<"games">, userId: Id<"users">): Promise<void> {
  const me = await ctx.db
    .query("gamePlayers")
    .withIndex("by_game_user", (q) => q.eq("gameId", gameId).eq("userId", userId))
    .unique();
  if (!me || me.botControlled !== true || me.botReason !== "disconnected" || me.status !== "active") return;
  await ctx.db.patch(me._id, { botControlled: undefined, botReason: undefined });
  const game = await ctx.db.get(gameId);
  if (!game?.currentSessionId) return;
  const session = await ctx.db.get(game.currentSessionId);
  if (!session || session.status !== "active" || !session.currentRoundId) return;
  const seat = session.seats.indexOf(me._id);
  if (seat < 0) return;
  const round = await ctx.db.get(session.currentRoundId);
  if (round && round.phase !== "scored" && round.turnSeat === seat) await setTurn(ctx, round._id);
}

/**
 * Runs every few seconds while a sitting is live: any seated human whose tab has been gone
 * for SEAT_TAKEOVER_MS hands their seat to a bot. Reschedules itself until the sitting ends,
 * so a finished session stops the loop.
 */
export const sweep = internalMutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session || session.status !== "active") return;
    const game = await ctx.db.get(session.gameId);
    if (!game || game.status !== "active") return;
    const now = Date.now();
    for (const playerId of session.seats) {
      const player = await ctx.db.get(playerId);
      if (!player || player.isBot || player.botControlled === true) continue;
      if (player.status !== "active" || player.userId === undefined) continue;
      const seen = await ctx.db
        .query("presence")
        .withIndex("by_game_user", (q) => q.eq("gameId", session.gameId).eq("userId", player.userId!))
        .unique();
      const lastSeenAt = seen?.lastSeenAt ?? session.startedAt;
      if (now - lastSeenAt < SEAT_TAKEOVER_MS) continue;
      await handSeatToBot(ctx, game, player, "disconnected");
    }
    await ctx.scheduler.runAfter(SWEEP_INTERVAL_MS, internal.presence.sweep, { sessionId });
  },
});
