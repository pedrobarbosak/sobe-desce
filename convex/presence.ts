import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { type MutationCtx, type QueryCtx, internalMutation, mutation } from "./_generated/server";
import { handSeatToBot } from "./game/seat";
import { requireUser } from "./lib/auth";

export const PRESENCE_TTL_MS = 40_000;
/** No heartbeat for this long while seated and a bot finishes the sitting for you. */
export const SEAT_TAKEOVER_MS = 60_000;
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
  },
});

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
