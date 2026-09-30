import { v } from "convex/values";
import { type RoundContext, autoPlay, chooseAction, choosePowerup } from "../../src/engine";
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
      await applyInternal(ctx, { roundId, nonce, loaded, action: boost, actor: "bot" });
      loaded = await loadRound(ctx, roundId);
    }
    // A bot's turn has no clock behind it (setTurn), so a move the engine rejects would
    // leave the table stuck. The least committal legal move keeps it going instead; the
    // engine checks a move before anything is written, so a rejected one left no trace.
    try {
      await applyInternal(ctx, { roundId, nonce, loaded, action: chooseAction(loaded.state, round.turnSeat, roundCtx), actor: "bot" });
    } catch (err) {
      console.error("bot move rejected, falling back to autoPlay", err);
      await applyInternal(ctx, { roundId, nonce, loaded, action: autoPlay(loaded.state, round.turnSeat), actor: "bot" });
    }
  },
});
