import {
  type Card,
  type PartyState,
  type Powerup,
  type Rank,
  type RoundRules,
  type RoundState,
  type TrickInProgress,
  type CompletedTrick,
  type Twist,
  partyRules,
} from "../../src/engine";
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

type PartyDoc = NonNullable<Doc<"rounds">["party"]>;

/** The public half of a party round, as stored on the round document. */
export function partyDoc(party: PartyState): PartyDoc {
  return {
    twist: party.twist,
    goldenSuit: party.goldenSuit ?? undefined,
    pass: party.pass ?? undefined,
    wildRank: party.wildRank ?? undefined,
    swapOffset: party.swapOffset,
    faceUpIndex: party.faceUpIndex,
    guardians: party.guardians ?? undefined,
    faceUp: party.faceUp,
    market: party.market,
    marketOrder: party.marketOrder,
    dummy: party.dummy,
    dummyTurn: party.dummyTurn,
    shielded: party.shielded,
    curses: party.curses,
    peeks: party.peeks,
  };
}

/** The twist as the engine knows it; `passLeft` is the old name of a one-card pass. */
function twistOf(doc: PartyDoc): Pick<PartyState, "twist" | "pass" | "wildRank"> {
  if (doc.twist === "passLeft") return { twist: "pass", pass: { count: 1, direction: "left" }, wildRank: null };
  return { twist: doc.twist as Twist, pass: doc.pass ?? null, wildRank: (doc.wildRank as Rank | undefined) ?? null };
}

/** The rules a stored party round plays by. */
export function rulesOfDoc(doc: PartyDoc | undefined): RoundRules | null {
  return doc ? partyRules(twistOf(doc)) : null;
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
  const maxDiscard = rulesOfDoc(round.party)?.maxDiscard ?? session.maxDiscard;
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
          ...twistOf(round.party),
          goldenSuit: round.party.goldenSuit ?? null,
          swapOffset: round.party.swapOffset ?? 0,
          faceUpIndex: round.party.faceUpIndex ?? Array.from({ length: session.seatCount }, () => 0),
          guardians: round.party.guardians ?? null,
          faceUp: (round.party.faceUp as (Card | null)[] | undefined) ?? Array.from({ length: session.seatCount }, () => null),
          market: (round.party.market as Card[] | undefined) ?? [],
          marketOrder: round.party.marketOrder ?? [],
          dummy: (round.party.dummy as Card[] | undefined) ?? [],
          dummyTurn: round.party.dummyTurn ?? 0,
          inventory: Array.from({ length: session.seatCount }, (_, seat) => [...((players[seat]?.powerups ?? []) as Powerup[])]),
          shielded: round.party.shielded,
          curses: round.party.curses,
          peeks: round.party.peeks,
          passes: Array.from({ length: session.seatCount }, (_, seat) => {
            const stored = secrets.passes?.[seat];
            // Rounds from before passes could carry several cards stored one string.
            if (stored === undefined || stored === null) return null;
            return (typeof stored === "string" ? [stored] : stored) as Card[];
          }),
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
  const passesBefore = loaded.state.party?.passes ?? [];
  const passesAfter = next.party?.passes ?? [];
  const passesChanged = passesAfter.some((c, i) => JSON.stringify(c) !== JSON.stringify(passesBefore[i] ?? null));
  if (next.drawPile.length !== secrets.drawPile.length || passesChanged) {
    await ctx.db.patch(secrets._id, { drawPile: next.drawPile, passes: next.party ? next.party.passes : undefined });
  }
}
