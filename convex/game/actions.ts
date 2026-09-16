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
    case "vote":
      return {}; // secret until everyone has voted, and nobody's business after
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
      return { count: action.cards.length }; // the cards stay secret until they land
    case "take":
      return { card: action.card };
    case "dummy":
      return { give: action.give ?? null, take: action.take ?? null };
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
 * `nonce` guards server-driven moves against acting on a stale turn. A caller that has
 * already loaded the round passes it in rather than paying for the reads twice.
 */
export async function applyInternal(
  ctx: MutationCtx,
  args: { roundId: Id<"rounds">; action: Action; actor: Actor; nonce?: number; loaded?: LoadedRound },
): Promise<{ applied: boolean }> {
  const loaded = args.loaded ?? (await loadRound(ctx, args.roundId));
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
    await setTurn(ctx, loaded.round._id, { fromTimer: args.actor === "timeout", session: loaded.session, game: loaded.game });
  }
  return { applied: true };
}

type Caller = { seat: number; loaded: LoadedRound };

/**
 * The caller's seat at this round, with the round loaded once for the move that follows.
 * The hands are in the load already, so the caller's is picked out of them rather than
 * looked up again.
 */
async function callerAt(ctx: MutationCtx, roundId: Id<"rounds">): Promise<Caller> {
  const user = await requireUser(ctx);
  const loaded = await loadRound(ctx, roundId);
  const hand = loaded.hands.find((h) => h.userId === user._id);
  if (!hand) throw new ConvexError({ code: "notSeated" });
  // Party rounds carry the roster in the load; classic ones do not.
  const player = loaded.players[hand.seat] ?? (await ctx.db.get(hand.gamePlayerId));
  if (player && (player.botControlled === true || player.status !== "active")) {
    throw new ConvexError({ code: "seatHandedToBot" });
  }
  if (isLeaving(loaded.session, hand.gamePlayerId)) throw new ConvexError({ code: "leftSitting" });
  return { seat: hand.seat, loaded };
}

/** A human move: authorise, then apply on the round already in hand. */
async function move(ctx: MutationCtx, roundId: Id<"rounds">, build: (seat: number) => Action): Promise<void> {
  const { seat, loaded } = await callerAt(ctx, roundId);
  await applyInternal(ctx, { roundId, loaded, actor: "user", action: build(seat) });
}

type CardArg = Action extends { card: infer C } ? C : never;

/** Party "voteTrump": this seat's vote. */
export const vote = mutation({
  args: { roundId: v.id("rounds"), suit },
  handler: (ctx, { roundId, suit }) => move(ctx, roundId, (seat) => ({ type: "vote", seat, suit })),
});

export const nameTrump = mutation({
  args: { roundId: v.id("rounds"), suit },
  handler: (ctx, { roundId, suit }) => move(ctx, roundId, (seat) => ({ type: "nameTrump", seat, suit })),
});

/** Hearts, called before the server has shown this seat a single card. */
export const darkHearts = mutation({
  args: { roundId: v.id("rounds") },
  handler: async (ctx, { roundId }) => {
    const { seat, loaded } = await callerAt(ctx, roundId);
    const { darkUntil } = loaded.round;
    if (darkUntil === undefined || Date.now() >= darkUntil) throw new ConvexError({ code: "darkWindowClosed" });
    await applyInternal(ctx, { roundId, loaded, actor: "user", action: { type: "darkHearts", seat } });
  },
});

/** Give up the blind option early and take the cards now. */
export const revealHand = mutation({
  args: { roundId: v.id("rounds") },
  handler: async (ctx, { roundId }) => {
    const { seat, loaded } = await callerAt(ctx, roundId);
    const { round } = loaded;
    if (round.phase !== "trump" || round.turnSeat !== seat || round.darkUntil === undefined) return;
    await ctx.db.patch(roundId, { darkUntil: undefined });
  },
});

export const flipTrump = mutation({
  args: { roundId: v.id("rounds") },
  handler: (ctx, { roundId }) => move(ctx, roundId, (seat) => ({ type: "flipTrump", seat })),
});

export const discard = mutation({
  args: { roundId: v.id("rounds"), cards: v.array(v.string()) },
  handler: (ctx, { roundId, cards }) => move(ctx, roundId, (seat) => ({ type: "discard", seat, cards: cards as CardArg[] })),
});

export const sitOut = mutation({
  args: { roundId: v.id("rounds") },
  handler: (ctx, { roundId }) => move(ctx, roundId, (seat) => ({ type: "sitOut", seat })),
});

export const playCard = mutation({
  args: { roundId: v.id("rounds"), card: v.string() },
  handler: (ctx, { roundId, card }) => move(ctx, roundId, (seat) => ({ type: "play", seat, card: card as CardArg })),
});

/** Party "pass" and "market": give away the chosen cards. */
export const passCards = mutation({
  args: { roundId: v.id("rounds"), cards: v.array(v.string()) },
  handler: (ctx, { roundId, cards }) => move(ctx, roundId, (seat) => ({ type: "pass", seat, cards: cards as CardArg[] })),
});

/** Party "market": take one card back from the middle. */
export const takeCard = mutation({
  args: { roundId: v.id("rounds"), card: v.string() },
  handler: (ctx, { roundId, card }) => move(ctx, roundId, (seat) => ({ type: "take", seat, card: card as CardArg })),
});

/** Party "dummy": swap one card with the spare hand, or leave it alone. */
export const dummySwap = mutation({
  args: { roundId: v.id("rounds"), give: v.optional(v.string()), take: v.optional(v.string()) },
  handler: (ctx, { roundId, give, take }) =>
    move(ctx, roundId, (seat) => {
      const action: Action = { type: "dummy", seat };
      if (give !== undefined) action.give = give as CardArg;
      if (take !== undefined) action.take = take as CardArg;
      return action;
    }),
});

/** Party: spend a powerup. Allowed out of turn while the round is being decided or played. */
export const usePowerup = mutation({
  args: { roundId: v.id("rounds"), powerup, target: v.optional(v.number()) },
  handler: (ctx, { roundId, powerup, target }) =>
    move(ctx, roundId, (seat) => {
      const action: Action = { type: "usePowerup", seat, powerup };
      if (target !== undefined) action.target = target;
      return action;
    }),
});
