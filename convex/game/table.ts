import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { query } from "../_generated/server";
import { currentUser } from "../lib/auth";
import { rulesOfDoc } from "./state";

/**
 * Everything the live table needs, computed per caller. Other players' hands never leave
 * the server; only the caller's own hand is included.
 */
export const get = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const user = await currentUser(ctx);
    const game = await ctx.db.get(gameId);
    if (!game) return null;
    const session = game.currentSessionId ? await ctx.db.get(game.currentSessionId) : null;
    const isOwner = user !== null && game.ownerId === user._id;
    if (!session) {
      return {
        game: publicGame(game),
        session: null,
        round: null,
        seats: [],
        mySeat: -1,
        myHand: null,
        myPowerups: [],
        myWard: null,
        inTheDark: false,
        openHands: null,
        serverNow: Date.now(),
        isOwner,
      };
    }
    const round = session.currentRoundId ? await ctx.db.get(session.currentRoundId) : null;
    const players = await Promise.all(session.seats.map((id) => ctx.db.get(id)));

    let mySeat = -1;
    if (user) mySeat = players.findIndex((p) => p?.userId === user._id);
    // "Before seeing any cards" is enforced here: while the blind window is open the seat
    // that settles the trump is not sent its own hand at all.
    const now = Date.now();
    const inTheDark =
      round !== null &&
      round.phase === "trump" &&
      round.turnSeat === mySeat &&
      mySeat >= 0 &&
      round.darkUntil !== undefined &&
      now < round.darkUntil;

    let myHand: string[] | null = null;
    if (round && user && mySeat >= 0 && !inTheDark) {
      const hand = await ctx.db
        .query("hands")
        .withIndex("by_round_user", (q) => q.eq("roundId", round._id).eq("userId", user._id))
        .unique();
      myHand = hand?.cards ?? null;
    }

    // A player who passed the round has no stake left in it, so they get to watch the
    // hands play out. Never before the tricks start: the others are still deciding.
    //
    // Nobody else sees them. A roster member who is not at the table tonight used to, and
    // that reached further than it looked: a campaign accepts joins while a sitting is
    // live, so anyone holding the invite code could walk in mid-round and read every hand
    // with a seated player one message away.
    const iAmOut = mySeat >= 0 && round?.participants[mySeat]?.decision === "out";
    const tricksVisible = round?.phase === "tricks" || round?.phase === "scored";
    // Party: a peek opens one chosen hand to the peeker for the rest of the round, a
    // guardian sees their ward's hand, and the "openHands" knob opens every hand to every
    // seated player. All of it only once the trump is settled.
    const rules = rulesOfDoc(round?.party);
    const peeked = new Set(round?.party?.peeks.filter((k) => k.seat === mySeat).map((k) => k.target) ?? []);
    const myWard = mySeat >= 0 ? round?.party?.guardians?.[mySeat] ?? null : null;
    if (myWard !== null && myWard !== mySeat && round?.phase !== "trump") peeked.add(myWard);
    const allOpen = round !== null && mySeat >= 0 && rules?.openHands === true && round.phase !== "trump";
    let openHands: { seat: number; cards: string[] }[] | null = null;
    if (round && ((iAmOut && tricksVisible) || peeked.size > 0 || allOpen)) {
      const all = await ctx.db
        .query("hands")
        .withIndex("by_round", (q) => q.eq("roundId", round._id))
        .collect();
      openHands = all
        .filter(
          (h) =>
            h.seat !== mySeat &&
            (allOpen || peeked.has(h.seat) || (iAmOut && tricksVisible && round.participants[h.seat]?.decision === "in")),
        )
        .map((h) => ({ seat: h.seat, cards: h.cards }));
    }
    const myPowerups = round?.party && mySeat >= 0 ? players[mySeat]?.powerups ?? [] : [];

    const seats = players.map((p, seat) => {
      const part = round?.participants[seat];
      return {
        seat,
        playerId: session.seats[seat]!,
        name: p?.name ?? "?",
        avatarSeed: p?.avatarSeed ?? "x",
        isBot: p?.isBot ?? true,
        botControlled: p?.botControlled === true,
        botReason: p?.botReason ?? null,
        left: p?.status !== "active" || (session.leaving?.includes(session.seats[seat]!) ?? false),
        score: p?.score ?? 0,
        // Who is connected comes from presence.onlineIn, so a heartbeat cannot invalidate
        // this query and re-send every hand at the table.
        userId: p?.userId ?? null,
        isMe: seat === mySeat,
        decision: part?.decision ?? "pending",
        tricksWon: part?.tricksWon ?? 0,
        handSize: part?.handSize ?? 0,
        discardCount: part?.discardCount ?? 0,
        delta: part?.delta,
        scoreAfter: part?.scoreAfter,
        sitOutStreak: session.sitOutStreak[seat] ?? 0,
      };
    });

    return {
      game: publicGame(game),
      session: {
        _id: session._id,
        index: session.index,
        status: session.status,
        hostPlayerId: session.hostPlayerId ?? null,
        seatCount: session.seatCount,
        maxDiscard: session.maxDiscard,
        dealerSeat: session.dealerSeat,
        roundsPlayed: session.roundsPlayed,
      },
      round: round
        ? {
            _id: round._id,
            index: round.index,
            dealerSeat: round.dealerSeat,
            trump: round.trump ?? null,
            trumpSeat: round.trumpSeat ?? null,
            flipped: round.flippedCard ?? null,
            darkHearts: round.darkHearts === true,
            darkUntil: round.darkUntil ?? null,
            phase: round.phase,
            turnSeat: round.turnSeat,
            turnNonce: round.turnNonce,
            turnDeadline: round.turnDeadline ?? null,
            currentTrick: round.currentTrick,
            completedTricks: round.completedTricks,
            deltas: round.deltas ?? null,
            party: round.party
              ? {
                  twist: round.party.twist === "passLeft" ? ("pass" as const) : round.party.twist,
                  goldenSuit: round.party.goldenSuit ?? null,
                  pass: round.party.pass ?? (round.party.twist === "passLeft" ? { count: 1, direction: "left" as const } : null),
                  wildRank: round.party.wildRank ?? null,
                  faceUp: round.party.faceUp ?? [],
                  market: round.party.market ?? [],
                  marketOrder: round.party.marketOrder ?? [],
                  dummy: round.party.dummy ?? [],
                  dummyTurn: round.party.dummyTurn ?? 0,
                  // Who guarded whom is the round's reveal: it stays hidden until scored.
                  guardians: round.phase === "scored" ? round.party.guardians ?? null : null,
                  shielded: round.party.shielded,
                  curses: round.party.curses,
                  peeks: round.party.peeks,
                  awards: round.party.awards ?? [],
                }
              : null,
            winnerSeat: round.winnerSeat ?? null,
            startedAt: round.startedAt,
            scoredAt: round.scoredAt ?? null,
          }
        : null,
      seats,
      mySeat,
      myHand,
      myPowerups,
      myWard,
      inTheDark,
      openHands,
      serverNow: now,
      isOwner,
    };
  },
});

function publicGame(game: Doc<"games">) {
  return {
    _id: game._id,
    code: game.code,
    name: game.name,
    mode: game.mode,
    status: game.status,
    config: game.config,
    winnerPlayerId: game.winnerPlayerId,
    rematchGameId: game.rematchGameId,
  };
}
