import { internalMutation } from "./_generated/server";
import { endSitting } from "./game/session";
import { deleteGameCascade } from "./games";

/**
 * A live sitting with no move in this long is not being played. A person's turn always ends
 * within the clock, and the bots always move, so the only tables this reaches are ones
 * waiting for someone who is not coming back, or stuck on a move nobody can make.
 */
export const STALE_SITTING_MS = 12 * 60 * 60_000;
/** A one-off table that was set up and never dealt. */
export const STALE_LOBBY_MS = 7 * 24 * 60 * 60_000;
/** Enough to clear a normal backlog in one pass without nearing the per-transaction limits. */
const PER_PASS = 50;

/** Hourly (crons.ts): end abandoned sittings, and throw away lobbies nobody started. */
export const sweepStale = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const live = await ctx.db
      .query("sessions")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .take(PER_PASS * 10);
    let ended = 0;
    for (const session of live) {
      if (ended >= PER_PASS) break;
      const lastMove = await ctx.db
        .query("actions")
        .withIndex("by_session", (q) => q.eq("sessionId", session._id))
        .order("desc")
        .first();
      const round = session.currentRoundId ? await ctx.db.get(session.currentRoundId) : null;
      const lastActivity = Math.max(session.startedAt, round?.startedAt ?? 0, round?.scoredAt ?? 0, lastMove?.at ?? 0);
      if (now - lastActivity < STALE_SITTING_MS) continue;
      await endSitting(ctx, session);
      ended++;
    }

    // Leagues are left alone: an organizer may take weeks to gather the roster.
    const lobbies = await ctx.db
      .query("games")
      .withIndex("by_status", (q) => q.eq("status", "lobby"))
      .take(PER_PASS);
    for (const game of lobbies) {
      if (game.mode !== "session" || now - game.createdAt < STALE_LOBBY_MS) continue;
      await deleteGameCascade(ctx, game._id);
    }
  },
});
