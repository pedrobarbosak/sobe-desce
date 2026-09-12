import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { query } from "../_generated/server";
import { currentUser } from "../lib/auth";
import { PRESENCE_TTL_MS } from "../presence";

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
        inTheDark: false,
        openHands: null,
        serverNow: Date.now(),
        isOwner,
      };
    }
    const round = session.currentRoundId ? await ctx.db.get(session.currentRoundId) : null;
    const players = await Promise.all(session.seats.map((id) => ctx.db.get(id)));
    const presence = await ctx.db
      .query("presence")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();
    const now = Date.now();
    const online = new Set(presence.filter((p) => now - p.lastSeenAt < PRESENCE_TTL_MS).map((p) => p.userId));

    let mySeat = -1;
    if (user) mySeat = players.findIndex((p) => p?.userId === user._id);
    // "Before seeing any cards" is enforced here: while the blind window is open the seat
    // that settles the trump is not sent its own hand at all.
    const now0 = Date.now();
    const inTheDark =
      round !== null &&
      round.phase === "trump" &&
      round.turnSeat === mySeat &&
      mySeat >= 0 &&
      round.darkUntil !== undefined &&
      now0 < round.darkUntil;

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
    let openHands: { seat: number; cards: string[] }[] | null = null;
    if (round && iAmOut && tricksVisible) {
      const all = await ctx.db
        .query("hands")
        .withIndex("by_round", (q) => q.eq("roundId", round._id))
        .collect();
      openHands = all
        .filter((h) => h.seat !== mySeat && round.participants[h.seat]?.decision === "in")
        .map((h) => ({ seat: h.seat, cards: h.cards }));
    }

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
        online: (p?.isBot ?? false) || (p?.userId !== undefined && online.has(p.userId)),
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
            winnerSeat: round.winnerSeat ?? null,
            startedAt: round.startedAt,
            scoredAt: round.scoredAt ?? null,
          }
        : null,
      seats,
      mySeat,
      myHand,
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
