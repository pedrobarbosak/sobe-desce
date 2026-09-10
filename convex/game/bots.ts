import { v } from "convex/values";
import { chooseAction } from "../../src/engine";
import { internalMutation } from "../_generated/server";
import { applyInternal } from "./actions";
import { loadRound } from "./state";

export const act = internalMutation({
  args: { roundId: v.id("rounds"), nonce: v.number() },
  handler: async (ctx, { roundId, nonce }) => {
    const round = await ctx.db.get(roundId);
    if (!round || round.turnNonce !== nonce || round.phase === "scored" || round.turnSeat === null) return;
    const loaded = await loadRound(ctx, roundId);
    const action = chooseAction(loaded.state, round.turnSeat, {
      scores: round.participants.map((p) => p.scoreBefore),
      sitOutStreak: loaded.session.sitOutStreak,
      forcedPlayThreshold: loaded.game.config.forcedPlayThreshold,
    });
    await applyInternal(ctx, { roundId, nonce, action, actor: "bot" });
  },
});
