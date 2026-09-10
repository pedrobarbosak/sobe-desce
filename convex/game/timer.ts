import { v } from "convex/values";
import { autoPlay } from "../../src/engine";
import { internalMutation } from "../_generated/server";
import { applyInternal } from "./actions";
import { loadRound } from "./state";

/** Turn timer expired: play the least committal legal move for whoever is on turn. */
export const onTimeout = internalMutation({
  args: { roundId: v.id("rounds"), nonce: v.number() },
  handler: async (ctx, { roundId, nonce }) => {
    const round = await ctx.db.get(roundId);
    if (!round || round.turnNonce !== nonce || round.phase === "scored" || round.turnSeat === null) return;
    const loaded = await loadRound(ctx, roundId);
    const action = autoPlay(loaded.state, round.turnSeat);
    await applyInternal(ctx, { roundId, nonce, action, actor: "timeout" });
  },
});
