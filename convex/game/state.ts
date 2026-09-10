import type { Card, RoundState, TrickInProgress, CompletedTrick } from "../../src/engine";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { ConvexError } from "convex/values";

export type LoadedRound = {
  game: Doc<"games">;
  session: Doc<"sessions">;
  round: Doc<"rounds">;
  hands: Doc<"hands">[];
  secrets: Doc<"roundSecrets">;
  state: RoundState;
};

export function toEngineState(
  game: Doc<"games">,
  session: Doc<"sessions">,
  round: Doc<"rounds">,
  hands: Doc<"hands">[],
  secrets: Doc<"roundSecrets">,
): RoundState {
  const handBySeat: Card[][] = Array.from({ length: session.seatCount }, () => []);
  for (const h of hands) handBySeat[h.seat] = h.cards as Card[];
  return {
    deck: game.config.deck,
    seatCount: session.seatCount,
    dealerSeat: round.dealerSeat,
    maxDiscard: session.maxDiscard,
    blankPenalty: game.config.blankPenalty,
    phase: round.phase,
    trump: round.trump ?? null,
    trumpSeat: round.trumpSeat ?? null,
    flipped: (round.flippedCard as Card | undefined) ?? null,
    darkHearts: round.darkHearts === true,
    turnSeat: round.turnSeat,
    seats: round.participants.map((p) => ({
      decision: p.decision,
      discardCount: p.discardCount,
      tricksWon: p.tricksWon,
    })),
    hands: handBySeat,
    drawPile: secrets.drawPile as Card[],
    currentTrick: round.currentTrick as TrickInProgress,
    completedTricks: round.completedTricks as CompletedTrick[],
    deltas: round.deltas ?? null,
  };
}

export async function loadRound(ctx: MutationCtx | QueryCtx, roundId: Id<"rounds">): Promise<LoadedRound> {
  const round = await ctx.db.get(roundId);
  if (!round) throw new ConvexError({ code: "notFound" });
  const [session, game, hands, secrets] = await Promise.all([
    ctx.db.get(round.sessionId),
    ctx.db.get(round.gameId),
    ctx.db
      .query("hands")
      .withIndex("by_round", (q) => q.eq("roundId", roundId))
      .collect(),
    ctx.db
      .query("roundSecrets")
      .withIndex("by_round", (q) => q.eq("roundId", roundId))
      .unique(),
  ]);
  if (!session || !game || !secrets) throw new ConvexError({ code: "notFound" });
  return { game, session, round, hands, secrets, state: toEngineState(game, session, round, hands, secrets) };
}

/** Write back whatever changed between the loaded state and `next`. */
export async function persistRound(ctx: MutationCtx, loaded: LoadedRound, next: RoundState): Promise<void> {
  const { round, hands, secrets } = loaded;
  const participants = round.participants.map((p) => {
    const s = next.seats[p.seat]!;
    return {
      ...p,
      decision: s.decision,
      discardCount: s.discardCount,
      tricksWon: s.tricksWon,
      handSize: next.hands[p.seat]!.length,
    };
  });
  await ctx.db.patch(round._id, {
    phase: next.phase,
    trump: next.trump ?? undefined,
    trumpSeat: next.trumpSeat ?? undefined,
    flippedCard: next.flipped ?? undefined,
    darkHearts: next.darkHearts || undefined,
    // Settling the trump ends the blind window, whichever way it was settled.
    darkUntil: next.phase === "trump" ? round.darkUntil : undefined,
    turnSeat: next.turnSeat,
    participants,
    currentTrick: next.currentTrick,
    completedTricks: next.completedTricks,
    deltas: next.deltas ?? undefined,
  });
  for (const h of hands) {
    const cards = next.hands[h.seat]!;
    if (cards.length !== h.cards.length || cards.some((c, i) => c !== h.cards[i])) {
      await ctx.db.patch(h._id, { cards });
    }
  }
  if (next.drawPile.length !== secrets.drawPile.length) {
    await ctx.db.patch(secrets._id, { drawPile: next.drawPile });
  }
}
