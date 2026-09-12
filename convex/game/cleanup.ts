import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { type MutationCtx, internalMutation } from "../_generated/server";

/**
 * How much to chew through in one pass.
 *
 * A round carries a hand per seat, one secrets row and roughly fifty log entries, so
 * twenty rounds is on the order of a thousand documents: an order of magnitude inside the
 * per-transaction write limit however many seats were at the table. A campaign that ran
 * for a year has hundreds of rounds behind it, which is why this cannot be one mutation.
 */
const ROUNDS_PER_PASS = 20;
const SESSIONS_PER_PASS = 200;

/** Throw a round away with everything hanging off it: hands, secrets and the action log. */
export async function deleteRoundDeep(ctx: MutationCtx, roundId: Id<"rounds">): Promise<void> {
  for (const hand of await ctx.db.query("hands").withIndex("by_round", (q) => q.eq("roundId", roundId)).collect()) {
    await ctx.db.delete(hand._id);
  }
  for (const secret of await ctx.db.query("roundSecrets").withIndex("by_round", (q) => q.eq("roundId", roundId)).collect()) {
    await ctx.db.delete(secret._id);
  }
  for (const action of await ctx.db.query("actions").withIndex("by_round_seq", (q) => q.eq("roundId", roundId)).collect()) {
    await ctx.db.delete(action._id);
  }
  await ctx.db.delete(roundId);
}

/**
 * Sweep the rounds and sittings of a game whose own document is already gone. Reschedules
 * itself until there is nothing left. Nothing reaches these rows in the meantime: every
 * query into a game starts from the game document.
 */
export const purgeGame = internalMutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .take(ROUNDS_PER_PASS);
    for (const round of rounds) await deleteRoundDeep(ctx, round._id);
    if (rounds.length === ROUNDS_PER_PASS) {
      await ctx.scheduler.runAfter(0, internal.game.cleanup.purgeGame, { gameId });
      return;
    }
    // Sittings are small, but a long campaign has a lot of them, so they page too.
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .take(SESSIONS_PER_PASS);
    for (const session of sessions) await ctx.db.delete(session._id);
    if (sessions.length === SESSIONS_PER_PASS) {
      await ctx.scheduler.runAfter(0, internal.game.cleanup.purgeGame, { gameId });
    }
  },
});

/** The same sweep for a single sitting that has already been unlinked from its game. */
export const purgeSessionRounds = internalMutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .take(ROUNDS_PER_PASS);
    for (const round of rounds) await deleteRoundDeep(ctx, round._id);
    if (rounds.length === ROUNDS_PER_PASS) {
      await ctx.scheduler.runAfter(0, internal.game.cleanup.purgeSessionRounds, { sessionId });
    }
  },
});
