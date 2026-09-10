import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

/**
 * How long the seat that settles the trump gets to call hearts blind. Their own cards are
 * withheld by the server for this long, so "before seeing any cards" is a fact rather than
 * a promise. Letting it lapse simply hands them their hand.
 */
export const DARK_WINDOW_MS = 10_000;

/**
 * Ends the blind window. Queries only re-run when data changes, so the deadline passing has
 * to be a write: this is what makes the withheld hand appear.
 */
export const close = internalMutation({
  args: { roundId: v.id("rounds") },
  handler: async (ctx, { roundId }) => {
    const round = await ctx.db.get(roundId);
    if (!round || round.darkUntil === undefined) return;
    await ctx.db.patch(roundId, { darkUntil: undefined });
  },
});
