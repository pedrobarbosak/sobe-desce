import { v } from "convex/values";
import { query } from "./_generated/server";
import { rosterOf } from "./games";

/** Sessions of a game, newest first, with a short summary each. */
export const sessions = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();
    const roster = await rosterOf(ctx, gameId);
    const names = new Map(roster.map((p) => [p._id, p]));
    return sessions
      .sort((a, b) => b.index - a.index)
      .map((s) => ({
        _id: s._id,
        index: s.index,
        status: s.status,
        manual: s.manual,
        seatCount: s.seatCount,
        maxDiscard: s.maxDiscard,
        roundsPlayed: s.roundsPlayed,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        note: s.note,
        players: s.seats.map((id) => ({
          playerId: id,
          name: names.get(id)?.name ?? "?",
          avatarSeed: names.get(id)?.avatarSeed ?? "x",
        })),
      }));
  },
});

/** Rounds of one session in order, with per-seat deltas. Public data only. */
export const rounds = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .collect();
    return rounds
      .sort((a, b) => a.index - b.index)
      .map((r) => ({
        _id: r._id,
        index: r.index,
        dealerSeat: r.dealerSeat,
        trump: r.trump ?? null,
        phase: r.phase,
        winnerSeat: r.winnerSeat ?? null,
        startedAt: r.startedAt,
        scoredAt: r.scoredAt ?? null,
        participants: r.participants.map((p) => ({
          seat: p.seat,
          gamePlayerId: p.gamePlayerId,
          decision: p.decision,
          discardCount: p.discardCount,
          tricksWon: p.tricksWon,
          scoreBefore: p.scoreBefore,
          delta: p.delta ?? null,
          scoreAfter: p.scoreAfter ?? null,
        })),
        tricks: r.completedTricks,
      }));
  },
});

/** The redacted action log of one round (for disputes and debugging the sobe rule). */
export const actions = query({
  args: { roundId: v.id("rounds") },
  handler: async (ctx, { roundId }) => {
    const rows = await ctx.db
      .query("actions")
      .withIndex("by_round_seq", (q) => q.eq("roundId", roundId))
      .collect();
    return rows.map((a) => ({ seq: a.seq, at: a.at, seat: a.seat, actor: a.actor, type: a.type, payload: a.payload }));
  },
});

/** Campaign standings: score, rounds, sessions and movement since the previous sitting. */
export const standings = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get(gameId);
    if (!game) return null;
    const roster = (await rosterOf(ctx, gameId)).filter((p) => p.status === "active" || (p.status === "left" && p.roundsPlayed > 0));
    const sessions = (
      await ctx.db
        .query("sessions")
        .withIndex("by_game", (q) => q.eq("gameId", gameId))
        .collect()
    ).sort((a, b) => a.index - b.index);

    const trajectory = new Map<string, number[]>();
    const lastSessionDelta = new Map<string, number>();
    for (const p of roster) trajectory.set(p._id, [game.config.startingPoints]);
    for (const s of sessions) {
      const rounds = (
        await ctx.db
          .query("rounds")
          .withIndex("by_session", (q) => q.eq("sessionId", s._id))
          .collect()
      ).sort((a, b) => a.index - b.index);
      const sessionDelta = new Map<string, number>();
      for (const r of rounds) {
        if (r.phase !== "scored") continue;
        for (const part of r.participants) {
          if (part.scoreAfter === undefined) continue;
          trajectory.get(part.gamePlayerId)?.push(part.scoreAfter);
          sessionDelta.set(part.gamePlayerId, (sessionDelta.get(part.gamePlayerId) ?? 0) + (part.delta ?? 0));
        }
      }
      if (sessionDelta.size > 0) {
        lastSessionDelta.clear();
        for (const [id, d] of sessionDelta) lastSessionDelta.set(id, d);
      }
    }

    return {
      startingPoints: game.config.startingPoints,
      winnerPlayerId: game.winnerPlayerId ?? null,
      players: roster
        .map((p) => ({
          playerId: p._id,
          name: p.name,
          avatarSeed: p.avatarSeed,
          isBot: p.isBot,
          left: p.status === "left",
          score: p.score,
          roundsPlayed: p.roundsPlayed,
          sessionsPlayed: p.sessionsPlayed,
          lastDelta: p.lastDelta,
          lastSessionDelta: lastSessionDelta.get(p._id) ?? 0,
          trajectory: trajectory.get(p._id) ?? [],
        }))
        .sort((a, b) => a.score - b.score || b.roundsPlayed - a.roundsPlayed),
      sessionsPlayed: sessions.length,
    };
  },
});
