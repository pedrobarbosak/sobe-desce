import { ConvexError, v } from "convex/values";
import { MIN_SEATS, TRICKS_PER_ROUND, applyDeltas, discardCapFor, roundDeltas } from "../src/engine";
import type { Doc } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { startRound } from "./game/advance";
import { closeSession } from "./game/session";
import { assertOwner, loadGame, myMembership, rosterOf, rosterOrder } from "./games";
import { requireUser } from "./lib/auth";
import { SWEEP_INTERVAL_MS } from "./presence";
import { suit } from "./lib/validators";

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/**
 * Start a sitting. Session games seat the whole lobby; campaign games seat the players
 * who checked in (or an explicit list from the organizer).
 */
export const start = mutation({
  args: { gameId: v.id("games"), playerIds: v.optional(v.array(v.id("gamePlayers"))) },
  handler: async (ctx, { gameId, playerIds }) => {
    const user = await requireUser(ctx);
    const game = await loadGame(ctx, gameId);
    const me = await myMembership(ctx, gameId, user._id);
    // A league carries on when the organizer is away: any member on the roster may open a
    // sitting, as long as enough people have checked in. One-off games stay owner-only,
    // and picking the exact line-up by hand is still the organizer's job.
    const openToMembers = game.mode === "campaign" && !playerIds && me !== null && me.status === "active";
    if (!openToMembers) assertOwner(game, user._id);
    if (game.status === "finished") throw new ConvexError({ code: "gameFinished" });
    if (game.currentSessionId) {
      const current = await ctx.db.get(game.currentSessionId);
      if (current?.status === "active") throw new ConvexError({ code: "sessionActive" });
    }
    const roster = (await rosterOf(ctx, gameId)).filter((p) => p.status === "active").sort(rosterOrder);
    let seated: Doc<"gamePlayers">[];
    if (game.mode === "session") {
      seated = roster;
    } else if (playerIds) {
      const wanted = new Set(playerIds);
      seated = roster.filter((p) => wanted.has(p._id));
    } else {
      seated = roster.filter((p) => p.checkedIn);
    }
    if (seated.length < MIN_SEATS) throw new ConvexError({ code: "notEnoughPlayers", min: MIN_SEATS });
    if (seated.length > game.config.seats) throw new ConvexError({ code: "tooManyPlayers", max: game.config.seats });
    const maxDiscard = discardCapFor(game.config.deck, seated.length);
    if (maxDiscard === null) throw new ConvexError({ code: "seatsDiscard" });

    const previous = await ctx.db
      .query("sessions")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();
    // Seats go round the table in the organizer's lobby order once they have arranged
    // one; until then the draw is random, as at any table.
    const arranged = seated.some((p) => p.order !== undefined);
    const seats = arranged ? seated.map((p) => p._id) : shuffleInPlace(seated.map((p) => p._id));
    const sessionId = await ctx.db.insert("sessions", {
      gameId,
      index: previous.length,
      status: "active",
      manual: false,
      hostPlayerId: me?._id,
      seats,
      seatCount: seats.length,
      maxDiscard,
      dealerSeat: Math.floor(Math.random() * seats.length),
      sitOutStreak: seats.map(() => 0),
      roundsPlayed: 0,
      startedAt: Date.now(),
    });
    for (const p of seated) {
      await ctx.db.patch(p._id, { sessionsPlayed: p.sessionsPlayed + 1, checkedIn: game.mode === "session" });
    }
    await ctx.db.patch(gameId, { status: "active", currentSessionId: sessionId });
    await startRound(ctx, sessionId);
    // Watches for tabs that go away mid-sitting; stops itself once the session ends.
    await ctx.scheduler.runAfter(SWEEP_INTERVAL_MS, internal.presence.sweep, { sessionId });
    return { sessionId };
  },
});

/** Campaign: close the sitting between rounds. Scores are already on the roster. */
export const close = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const user = await requireUser(ctx);
    const game = await loadGame(ctx, gameId);
    if (!game.currentSessionId) return;
    const session = await ctx.db.get(game.currentSessionId);
    if (!session || session.status !== "active") return;
    const me = await myMembership(ctx, gameId, user._id);
    // Whoever opened the sitting runs it, and anyone at the table can call time. Without
    // that last clause a sitting whose opener has gone home could never be closed.
    const allowed =
      game.ownerId === user._id ||
      (me !== null && (session.hostPlayerId === me._id || session.seats.includes(me._id)));
    if (!allowed) throw new ConvexError({ code: "notOwner" });
    await closeSession(ctx, session);
    for (const p of await rosterOf(ctx, gameId)) {
      if (p.checkedIn) await ctx.db.patch(p._id, { checkedIn: false });
    }
  },
});

const manualRound = v.object({
  trump: v.optional(suit),
  results: v.array(v.object({ playerId: v.id("gamePlayers"), participated: v.boolean(), tricksWon: v.number() })),
});

/**
 * Campaign: record an in-person sitting. Either round by round (tricks per player, scored
 * with the exact same rules as online play) or as final per-player deltas.
 */
export const recordManual = mutation({
  args: {
    gameId: v.id("games"),
    playerIds: v.array(v.id("gamePlayers")),
    rounds: v.optional(v.array(manualRound)),
    deltas: v.optional(v.array(v.object({ playerId: v.id("gamePlayers"), delta: v.number() }))),
    note: v.optional(v.string()),
    playedAt: v.optional(v.number()),
  },
  handler: async (ctx, { gameId, playerIds, rounds, deltas, note, playedAt }) => {
    const user = await requireUser(ctx);
    const game = await loadGame(ctx, gameId);
    assertOwner(game, user._id);
    if (game.mode !== "campaign") throw new ConvexError({ code: "campaignOnly" });
    if (game.status === "finished") throw new ConvexError({ code: "gameFinished" });
    if (game.currentSessionId) {
      const current = await ctx.db.get(game.currentSessionId);
      if (current?.status === "active") throw new ConvexError({ code: "sessionActive" });
    }
    const unique = [...new Set(playerIds)];
    if (unique.length < 2) throw new ConvexError({ code: "notEnoughPlayers", min: 2 });
    const players = new Map<string, Doc<"gamePlayers">>();
    for (const id of unique) {
      const p = await ctx.db.get(id);
      if (!p || p.gameId !== gameId) throw new ConvexError({ code: "notFound" });
      players.set(id, p);
    }
    const seatOf = new Map(unique.map((id, i) => [id, i]));
    const previous = await ctx.db.query("sessions").withIndex("by_game", (q) => q.eq("gameId", gameId)).collect();
    const at = playedAt ?? Date.now();
    const sessionId = await ctx.db.insert("sessions", {
      gameId,
      index: previous.length,
      status: "finished",
      manual: true,
      seats: unique,
      seatCount: unique.length,
      maxDiscard: discardCapFor(game.config.deck, unique.length) ?? 0,
      dealerSeat: 0,
      sitOutStreak: unique.map(() => 0),
      roundsPlayed: 0,
      startedAt: at,
      endedAt: at,
      note: note?.trim().slice(0, 200) || undefined,
    });

    // Normalise both input shapes into rounds of per-seat deltas.
    type RoundSpec = { trump?: "H" | "D" | "C" | "S"; deltas: Map<number, number>; tricks: Map<number, number>; participated: Set<number> };
    const specs: RoundSpec[] = [];
    if (rounds && rounds.length > 0) {
      for (const r of rounds) {
        const results = r.results.filter((x) => seatOf.has(x.playerId));
        const inPlayers = results.filter((x) => x.participated);
        const total = inPlayers.reduce((n, x) => n + x.tricksWon, 0);
        if (inPlayers.length >= 1 && total !== TRICKS_PER_ROUND) throw new ConvexError({ code: "tricksMustSumToFive" });
        const d = roundDeltas(
          results.map((x) => ({ seat: seatOf.get(x.playerId)!, participated: x.participated, tricksWon: x.tricksWon })),
          r.trump ?? "S",
          game.config.blankPenalty,
        );
        specs.push({
          trump: r.trump,
          deltas: d,
          tricks: new Map(results.map((x) => [seatOf.get(x.playerId)!, x.tricksWon])),
          participated: new Set(inPlayers.map((x) => seatOf.get(x.playerId)!)),
        });
      }
    } else if (deltas && deltas.length > 0) {
      const d = new Map<number, number>();
      for (const x of deltas) if (seatOf.has(x.playerId)) d.set(seatOf.get(x.playerId)!, Math.trunc(x.delta));
      specs.push({ deltas: d, tricks: new Map(), participated: new Set(d.keys()) });
    } else {
      throw new ConvexError({ code: "nothingToRecord" });
    }

    let winnerSeat: number | undefined;
    let index = 0;
    for (const spec of specs) {
      if (winnerSeat !== undefined) break;
      const before = new Map(unique.map((id, seat) => [seat, players.get(id)!.score]));
      const { scores, winner } = applyDeltas(before, spec.deltas, unique.map((_, i) => i));
      const participants = unique.map((id, seat) => {
        const p = players.get(id)!;
        const delta = spec.deltas.get(seat) ?? 0;
        const scoreAfter = scores.get(seat) ?? p.score;
        p.score = scoreAfter;
        return {
          seat,
          gamePlayerId: id,
          decision: spec.participated.has(seat) ? ("in" as const) : ("out" as const),
          discardCount: 0,
          handSize: 0,
          tricksWon: spec.tricks.get(seat) ?? 0,
          scoreBefore: before.get(seat)!,
          delta,
          scoreAfter,
        };
      });
      await ctx.db.insert("rounds", {
        sessionId,
        gameId,
        index,
        dealerSeat: index % unique.length,
        trump: spec.trump,
        phase: "scored",
        turnSeat: null,
        turnNonce: 0,
        participants,
        currentTrick: { leader: 0, plays: [] },
        completedTricks: [],
        deltas: unique.map((_, seat) => spec.deltas.get(seat) ?? 0),
        winnerSeat: winner,
        startedAt: at,
        scoredAt: at,
      });
      for (const [seat, id] of unique.entries()) {
        const p = players.get(id)!;
        await ctx.db.patch(id, {
          score: p.score,
          lastDelta: spec.deltas.get(seat) ?? 0,
          roundsPlayed: p.roundsPlayed + (spec.participated.has(seat) ? 1 : 0),
        });
        p.roundsPlayed += spec.participated.has(seat) ? 1 : 0;
      }
      index++;
      winnerSeat = winner;
    }
    await ctx.db.patch(sessionId, { roundsPlayed: index });
    for (const id of unique) {
      const p = players.get(id)!;
      await ctx.db.patch(id, { sessionsPlayed: p.sessionsPlayed + 1 });
    }
    if (winnerSeat !== undefined) {
      await ctx.db.patch(gameId, { status: "finished", winnerPlayerId: unique[winnerSeat], finishedAt: at });
    } else if (game.status === "lobby") {
      await ctx.db.patch(gameId, { status: "active" });
    }
    return { sessionId, winnerPlayerId: winnerSeat !== undefined ? unique[winnerSeat] : null };
  },
});

/**
 * Host only: strike a sitting from the record. With `revertScores` every point it moved
 * is given back and the counters step back with it, as if the night had never happened;
 * without it only the record goes and the standings stay where they are.
 */
export const remove = mutation({
  args: { gameId: v.id("games"), sessionId: v.id("sessions"), revertScores: v.boolean() },
  handler: async (ctx, { gameId, sessionId, revertScores }) => {
    const user = await requireUser(ctx);
    const game = await loadGame(ctx, gameId);
    assertOwner(game, user._id);
    const session = await ctx.db.get(sessionId);
    if (!session || session.gameId !== gameId) throw new ConvexError({ code: "notFound" });
    if (session.status === "active") throw new ConvexError({ code: "sessionActive" });

    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .collect();
    if (revertScores) {
      const undo = new Map<string, { score: number; rounds: number }>();
      for (const r of rounds) {
        if (r.phase !== "scored") continue;
        for (const p of r.participants) {
          const acc = undo.get(p.gamePlayerId) ?? { score: 0, rounds: 0 };
          acc.score += p.delta ?? 0;
          acc.rounds += p.decision === "in" && p.delta !== undefined ? 1 : 0;
          undo.set(p.gamePlayerId, acc);
        }
      }
      for (const id of session.seats) {
        const player = await ctx.db.get(id);
        if (!player) continue;
        const acc = undo.get(id) ?? { score: 0, rounds: 0 };
        await ctx.db.patch(id, {
          score: player.score - acc.score,
          roundsPlayed: Math.max(0, player.roundsPlayed - acc.rounds),
          sessionsPlayed: Math.max(0, player.sessionsPlayed - 1),
          lastDelta: 0,
        });
      }
      // A win decided in this sitting is undone with it.
      if (game.status === "finished" && game.winnerPlayerId && session.seats.includes(game.winnerPlayerId)) {
        await ctx.db.patch(gameId, { status: "active", winnerPlayerId: undefined, finishedAt: undefined });
      }
    }
    for (const round of rounds) {
      for (const hand of await ctx.db.query("hands").withIndex("by_round", (q) => q.eq("roundId", round._id)).collect()) {
        await ctx.db.delete(hand._id);
      }
      for (const secret of await ctx.db.query("roundSecrets").withIndex("by_round", (q) => q.eq("roundId", round._id)).collect()) {
        await ctx.db.delete(secret._id);
      }
      for (const action of await ctx.db.query("actions").withIndex("by_round_seq", (q) => q.eq("roundId", round._id)).collect()) {
        await ctx.db.delete(action._id);
      }
      await ctx.db.delete(round._id);
    }
    await ctx.db.delete(sessionId);
    // Later sittings close the gap so the numbering stays continuous.
    const later = await ctx.db
      .query("sessions")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();
    for (const s of later) {
      if (s.index > session.index) await ctx.db.patch(s._id, { index: s.index - 1 });
    }
  },
});
