import { type Card, type PartyState, type Powerup, type RoundState, type TrickInProgress, type CompletedTrick, partyRules } from "../../src/engine";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { ConvexError } from "convex/values";

export type LoadedRound = {
  game: Doc<"games">;
  session: Doc<"sessions">;
  round: Doc<"rounds">;
  hands: Doc<"hands">[];
  secrets: Doc<"roundSecrets">;
  /** By seat. Carries the party inventories. */
  players: (Doc<"gamePlayers"> | null)[];
  state: RoundState;
};

/** The public half of a party round, as stored on the round document. */
export function partyDoc(party: PartyState): NonNullable<Doc<"rounds">["party"]> {
  return {
    twist: party.twist,
    goldenSuit: party.goldenSuit ?? undefined,
    shielded: party.shielded,
    curses: party.curses,
    peeks: party.peeks,
  };
}

export function toEngineState(
  game: Doc<"games">,
  session: Doc<"sessions">,
  round: Doc<"rounds">,
  hands: Doc<"hands">[],
  secrets: Doc<"roundSecrets">,
  players: (Doc<"gamePlayers"> | null)[],
): RoundState {
  const handBySeat: Card[][] = Array.from({ length: session.seatCount }, () => []);
  for (const h of hands) handBySeat[h.seat] = h.cards as Card[];
  // A twist may cap the discards for the round; the sitting's cap is the fallback.
  const maxDiscard = (round.party ? partyRules(round.party).maxDiscard : null) ?? session.maxDiscard;
  return {
    deck: game.config.deck,
    seatCount: session.seatCount,
    dealerSeat: round.dealerSeat,
    maxDiscard,
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
    party: round.party
      ? {
          twist: round.party.twist,
          goldenSuit: round.party.goldenSuit ?? null,
          inventory: Array.from({ length: session.seatCount }, (_, seat) => [...((players[seat]?.powerups ?? []) as Powerup[])]),
          shielded: round.party.shielded,
          curses: round.party.curses,
          peeks: round.party.peeks,
          passes: Array.from({ length: session.seatCount }, (_, seat) => (secrets.passes?.[seat] as Card | null | undefined) ?? null),
        }
      : null,
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
  // Inventories ride on the roster, so a party round needs the seated players too.
  const players = round.party ? await Promise.all(session.seats.map((id) => ctx.db.get(id))) : session.seats.map(() => null);
  return { game, session, round, hands, secrets, players, state: toEngineState(game, session, round, hands, secrets, players) };
}

/** Write back whatever changed between the loaded state and `next`. */
export async function persistRound(ctx: MutationCtx, loaded: LoadedRound, next: RoundState): Promise<void> {
  const { round, hands, secrets, players } = loaded;
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
    party: next.party ? { ...partyDoc(next.party), awards: round.party?.awards } : undefined,
  });
  if (next.party) {
    for (let seat = 0; seat < next.party.inventory.length; seat++) {
      const player = players[seat];
      if (!player) continue;
      const before = player.powerups ?? [];
      const after = next.party.inventory[seat]!;
      if (before.length !== after.length || after.some((p, i) => p !== before[i])) {
        await ctx.db.patch(player._id, { powerups: after });
      }
    }
  }
  for (const h of hands) {
    const cards = next.hands[h.seat]!;
    if (cards.length !== h.cards.length || cards.some((c, i) => c !== h.cards[i])) {
      await ctx.db.patch(h._id, { cards });
    }
  }
  const passesBefore = secrets.passes ?? [];
  const passesAfter = next.party?.passes ?? [];
  const passesChanged = passesAfter.some((c, i) => c !== (passesBefore[i] ?? null));
  if (next.drawPile.length !== secrets.drawPile.length || passesChanged) {
    await ctx.db.patch(secrets._id, { drawPile: next.drawPile, passes: next.party ? next.party.passes : undefined });
  }
}
