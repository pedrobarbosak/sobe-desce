import { v } from "convex/values";
import { type RoundContext, chooseAction, choosePowerup } from "../../src/engine";
import { internalMutation } from "../_generated/server";
import { applyInternal } from "./actions";
import { loadRound } from "./state";

export const act = internalMutation({
  args: { roundId: v.id("rounds"), nonce: v.number() },
  handler: async (ctx, { roundId, nonce }) => {
    const round = await ctx.db.get(roundId);
    if (!round || round.turnNonce !== nonce || round.phase === "scored" || round.turnSeat === null) return;
    let loaded = await loadRound(ctx, roundId);
    const roundCtx: RoundContext = {
      scores: round.participants.map((p) => p.scoreBefore),
      sitOutStreak: loaded.session.sitOutStreak,
      forcedPlayThreshold: loaded.game.config.forcedPlayThreshold,
    };
    // Party: a powerup goes first and leaves the turn where it is, so the move still lands.
    const boost = choosePowerup(loaded.state, round.turnSeat, roundCtx);
    if (boost) {
      await applyInternal(ctx, { roundId, nonce, action: boost, actor: "bot" });
      loaded = await loadRound(ctx, roundId);
    }
    const action = chooseAction(loaded.state, round.turnSeat, roundCtx);
    await applyInternal(ctx, { roundId, nonce, action, actor: "bot" });
  },
});
