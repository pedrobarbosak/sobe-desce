import { ConvexError, v } from "convex/values";
import { type Action, type RoundContext, applyAction } from "../../src/engine";
import type { Doc, Id } from "../_generated/dataModel";
import { type MutationCtx, mutation } from "../_generated/server";
import { requireUser } from "../lib/auth";
import { powerup, suit } from "../lib/validators";
import { finalizeRound, setTurn } from "./advance";
import { isLeaving } from "./session";
import { type LoadedRound, loadRound, persistRound } from "./state";

type Actor = Doc<"actions">["actor"];

function contextFor(loaded: LoadedRound): RoundContext {
  return {
    scores: loaded.round.participants.map((p) => p.scoreBefore),
    sitOutStreak: loaded.session.sitOutStreak,
    forcedPlayThreshold: loaded.game.config.forcedPlayThreshold,
  };
}

function redactPayload(action: Action): unknown {
  switch (action.type) {
    case "nameTrump":
      return { suit: action.suit };
    case "flipTrump":
      return {};
    case "darkHearts":
      return {};
    case "discard":
      return { count: action.cards.length };
    case "sitOut":
      return {};
    case "play":
      return { card: action.card };
    case "pass":
      return {}; // the card stays secret: it surfaces in the receiver's hand only
    case "usePowerup":
      return { powerup: action.powerup, target: action.target };
  }
}

async function appendAction(ctx: MutationCtx, loaded: LoadedRound, action: Action, actor: Actor) {
  const last = await ctx.db
    .query("actions")
    .withIndex("by_round_seq", (q) => q.eq("roundId", loaded.round._id))
    .order("desc")
    .first();
  await ctx.db.insert("actions", {
    roundId: loaded.round._id,
    sessionId: loaded.session._id,
    gameId: loaded.game._id,
    seq: (last?.seq ?? -1) + 1,
    at: Date.now(),
    seat: action.seat,
    actor,
    type: action.type,
    payload: redactPayload(action),
  });
}

/**
 * The one body every move goes through: humans, bots and timeouts alike.
 * `nonce` guards server-driven moves against acting on a stale turn.
 */
export async function applyInternal(
  ctx: MutationCtx,
  args: { roundId: Id<"rounds">; action: Action; actor: Actor; nonce?: number },
): Promise<{ applied: boolean }> {
  const loaded = await loadRound(ctx, args.roundId);
  if (args.nonce !== undefined && loaded.round.turnNonce !== args.nonce) return { applied: false };
  if (loaded.round.phase === "scored") throw new ConvexError({ code: "wrongPhase" });
  if (loaded.session.status !== "active") throw new ConvexError({ code: "sessionFinished" });
  const result = applyAction(loaded.state, args.action, contextFor(loaded));
  if (!result.ok) throw new ConvexError({ code: result.error.code });
  await persistRound(ctx, loaded, result.state);
  await appendAction(ctx, loaded, args.action, args.actor);
  // A powerup is spent out of turn: the clock and the seat on turn stay as they were.
  if (args.action.type === "usePowerup") return { applied: true };
  if (result.state.phase === "scored") {
    await finalizeRound(ctx, loaded, result.state);
  } else {
    await setTurn(ctx, loaded.round._id);
  }
  return { applied: true };
}

async function mySeat(ctx: MutationCtx, roundId: Id<"rounds">): Promise<number> {
  const user = await requireUser(ctx);
  const hand = await ctx.db
    .query("hands")
    .withIndex("by_round_user", (q) => q.eq("roundId", roundId).eq("userId", user._id))
    .unique();
  if (!hand) throw new ConvexError({ code: "notSeated" });
  const player = await ctx.db.get(hand.gamePlayerId);
  if (player && (player.botControlled === true || player.status !== "active")) {
    throw new ConvexError({ code: "seatHandedToBot" });
  }
  const round = await ctx.db.get(roundId);
  const session = round ? await ctx.db.get(round.sessionId) : null;
  if (session && isLeaving(session, hand.gamePlayerId)) throw new ConvexError({ code: "leftSitting" });
  return hand.seat;
}

export const nameTrump = mutation({
  args: { roundId: v.id("rounds"), suit },
  handler: async (ctx, { roundId, suit }) => {
    const seat = await mySeat(ctx, roundId);
    await applyInternal(ctx, { roundId, actor: "user", action: { type: "nameTrump", seat, suit } });
  },
});

/** Hearts, called before the server has shown this seat a single card. */
export const darkHearts = mutation({
  args: { roundId: v.id("rounds") },
  handler: async (ctx, { roundId }) => {
    const seat = await mySeat(ctx, roundId);
    const round = await ctx.db.get(roundId);
    if (!round || round.darkUntil === undefined || Date.now() >= round.darkUntil) {
      throw new ConvexError({ code: "darkWindowClosed" });
    }
    await applyInternal(ctx, { roundId, actor: "user", action: { type: "darkHearts", seat } });
  },
});

/** Give up the blind option early and take the cards now. */
export const revealHand = mutation({
  args: { roundId: v.id("rounds") },
  handler: async (ctx, { roundId }) => {
    const seat = await mySeat(ctx, roundId);
    const round = await ctx.db.get(roundId);
    if (!round || round.phase !== "trump" || round.turnSeat !== seat) return;
    if (round.darkUntil === undefined) return;
    await ctx.db.patch(roundId, { darkUntil: undefined });
  },
});

export const flipTrump = mutation({
  args: { roundId: v.id("rounds") },
  handler: async (ctx, { roundId }) => {
    const seat = await mySeat(ctx, roundId);
    await applyInternal(ctx, { roundId, actor: "user", action: { type: "flipTrump", seat } });
  },
});

export const discard = mutation({
  args: { roundId: v.id("rounds"), cards: v.array(v.string()) },
  handler: async (ctx, { roundId, cards }) => {
    const seat = await mySeat(ctx, roundId);
    await applyInternal(ctx, {
      roundId,
      actor: "user",
      action: { type: "discard", seat, cards: cards as Action extends { cards: infer C } ? C : never },
    });
  },
});

export const sitOut = mutation({
  args: { roundId: v.id("rounds") },
  handler: async (ctx, { roundId }) => {
    const seat = await mySeat(ctx, roundId);
    await applyInternal(ctx, { roundId, actor: "user", action: { type: "sitOut", seat } });
  },
});

export const playCard = mutation({
  args: { roundId: v.id("rounds"), card: v.string() },
  handler: async (ctx, { roundId, card }) => {
    const seat = await mySeat(ctx, roundId);
    await applyInternal(ctx, {
      roundId,
      actor: "user",
      action: { type: "play", seat, card: card as Action extends { card: infer C } ? C : never },
    });
  },
});

/** Party "passLeft": hand one card to the seat on your left. */
export const passCard = mutation({
  args: { roundId: v.id("rounds"), card: v.string() },
  handler: async (ctx, { roundId, card }) => {
    const seat = await mySeat(ctx, roundId);
    await applyInternal(ctx, {
      roundId,
      actor: "user",
      action: { type: "pass", seat, card: card as Action extends { card: infer C } ? C : never },
    });
  },
});

/** Party: spend a powerup. Allowed out of turn while the round is being decided or played. */
export const usePowerup = mutation({
  args: { roundId: v.id("rounds"), powerup, target: v.optional(v.number()) },
  handler: async (ctx, { roundId, powerup, target }) => {
    const seat = await mySeat(ctx, roundId);
    const action: Action = { type: "usePowerup", seat, powerup };
    if (target !== undefined) action.target = target;
    await applyInternal(ctx, { roundId, actor: "user", action });
  },
});
