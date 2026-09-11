import { v } from "convex/values";
import { applyDeltas, createRound, playOrder } from "../../src/engine";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { type MutationCtx, internalMutation } from "../_generated/server";
import { DARK_WINDOW_MS } from "./dark";
import { applyLeaving, isLeaving } from "./session";
import type { LoadedRound } from "./state";
import type { RoundState } from "../../src/engine";

export const BOT_DELAY_MS = 900;
export const NEXT_ROUND_DELAY_MS = 6_000;

function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

/** Bots, handed-over seats and players who left are driven by the server. */
export function isServerDriven(player: Doc<"gamePlayers"> | null): boolean {
  return (
    !player ||
    player.isBot ||
    player.botControlled === true ||
    player.status !== "active" ||
    player.userId === undefined
  );
}

/** Bump the nonce, arm the turn timer, and poke a bot if it is one. */
export async function setTurn(ctx: MutationCtx, roundId: Id<"rounds">): Promise<void> {
  const round = await ctx.db.get(roundId);
  if (!round) return;
  const [session, game] = await Promise.all([ctx.db.get(round.sessionId), ctx.db.get(round.gameId)]);
  if (!session || !game) return;
  // Stale timers are not cancelled (the scheduler may be running this very function);
  // the nonce check in onTimeout makes them harmless no-ops.
  const nonce = round.turnNonce + 1;
  if (round.turnSeat === null) {
    await ctx.db.patch(roundId, { turnNonce: nonce, turnDeadline: undefined, timerId: undefined });
    return;
  }
  const ms = game.config.turnSeconds * 1000;
  const timerId = await ctx.scheduler.runAfter(ms, internal.game.timer.onTimeout, { roundId, nonce });
  await ctx.db.patch(roundId, { turnNonce: nonce, turnDeadline: Date.now() + ms, timerId });
  const playerId = session.seats[round.turnSeat];
  const player = playerId ? await ctx.db.get(playerId) : null;
  if (isServerDriven(player) || (playerId !== undefined && isLeaving(session, playerId))) {
    await ctx.scheduler.runAfter(BOT_DELAY_MS, internal.game.bots.act, { roundId, nonce });
  }
}

/** Deal a new round for the session (rotating the dealer after the first). */
export async function startRound(ctx: MutationCtx, sessionId: Id<"sessions">): Promise<Id<"rounds">> {
  const before = await ctx.db.get(sessionId);
  if (!before || before.status !== "active") throw new Error("Session is not active");
  const game = await ctx.db.get(before.gameId);
  if (!game) throw new Error("Game missing");
  const session = await applyLeaving(ctx, before, game);
  const index = session.roundsPlayed;
  const dealerSeat = index === 0 ? session.dealerSeat : (session.dealerSeat + 1) % session.seatCount;
  const seed = randomSeed();
  // Never let the blind window swallow the turn on a table with a short clock.
  const darkMs = Math.min(DARK_WINDOW_MS, Math.floor((game.config.turnSeconds * 1000) / 2));
  const state = createRound({
    deck: game.config.deck,
    seatCount: session.seatCount,
    dealerSeat,
    maxDiscard: session.maxDiscard,
    blankPenalty: game.config.blankPenalty,
    seed,
  });
  const players = await Promise.all(session.seats.map((id) => ctx.db.get(id)));
  const participants = session.seats.map((gamePlayerId, seat) => ({
    seat,
    gamePlayerId,
    decision: "pending" as const,
    discardCount: 0,
    handSize: state.hands[seat]!.length,
    tricksWon: 0,
    scoreBefore: players[seat]?.score ?? game.config.startingPoints,
  }));
  const roundId = await ctx.db.insert("rounds", {
    sessionId,
    gameId: game._id,
    index,
    dealerSeat,
    phase: state.phase,
    turnSeat: state.turnSeat,
    turnNonce: 0,
    participants,
    currentTrick: state.currentTrick,
    completedTricks: [],
    darkUntil: Date.now() + darkMs,
    startedAt: Date.now(),
  });
  // The window has to end with a write, or the withheld hand would never appear.
  await ctx.scheduler.runAfter(darkMs, internal.game.dark.close, { roundId });
  for (let seat = 0; seat < session.seatCount; seat++) {
    await ctx.db.insert("hands", {
      roundId,
      gamePlayerId: session.seats[seat]!,
      userId: players[seat]?.userId,
      seat,
      cards: state.hands[seat]!,
    });
  }
  await ctx.db.insert("roundSecrets", { roundId, seed, drawPile: state.drawPile });
  await ctx.db.patch(sessionId, { currentRoundId: roundId, dealerSeat });
  await setTurn(ctx, roundId);
  return roundId;
}

/** Apply a scored round to the roster, then either finish the game or queue the next deal. */
export async function finalizeRound(ctx: MutationCtx, loaded: LoadedRound, next: RoundState): Promise<void> {
  const { round, session, game } = loaded;
  const deltasArr = next.deltas ?? [];
  const before = new Map(round.participants.map((p) => [p.seat, p.scoreBefore]));
  const deltas = new Map(deltasArr.map((d, seat) => [seat, d]));
  const { scores, winner } = applyDeltas(before, deltas, playOrder(round.dealerSeat, session.seatCount));

  const participants = [];
  const sitOutStreak = [...session.sitOutStreak];
  for (const p of round.participants) {
    const s = next.seats[p.seat]!;
    const delta = deltas.get(p.seat) ?? 0;
    const scoreAfter = scores.get(p.seat) ?? p.scoreBefore;
    participants.push({ ...p, decision: s.decision, tricksWon: s.tricksWon, discardCount: s.discardCount, handSize: 0, delta, scoreAfter });
    const player = await ctx.db.get(p.gamePlayerId);
    if (player) {
      await ctx.db.patch(player._id, {
        score: scoreAfter,
        lastDelta: delta,
        roundsPlayed: player.roundsPlayed + (s.decision === "in" ? 1 : 0),
      });
    }
    sitOutStreak[p.seat] = s.decision === "out" ? (sitOutStreak[p.seat] ?? 0) + 1 : 0;
  }
  await ctx.db.patch(round._id, {
    phase: "scored",
    participants,
    deltas: deltasArr,
    winnerSeat: winner,
    turnSeat: null,
    turnNonce: round.turnNonce + 1,
    turnDeadline: undefined,
    timerId: undefined,
    scoredAt: Date.now(),
  });
  await ctx.db.patch(session._id, { sitOutStreak, roundsPlayed: session.roundsPlayed + 1 });

  if (winner !== undefined) {
    const now = Date.now();
    await ctx.db.patch(session._id, { status: "finished", endedAt: now });
    await ctx.db.patch(game._id, {
      status: "finished",
      winnerPlayerId: session.seats[winner],
      finishedAt: now,
    });
    return;
  }
  await ctx.scheduler.runAfter(NEXT_ROUND_DELAY_MS, internal.game.advance.nextRound, {
    sessionId: session._id,
    afterRoundId: round._id,
  });
}

export const nextRound = internalMutation({
  args: { sessionId: v.id("sessions"), afterRoundId: v.id("rounds") },
  handler: async (ctx, { sessionId, afterRoundId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session || session.status !== "active") return;
    if (session.currentRoundId !== afterRoundId) return; // stale
    const round = await ctx.db.get(afterRoundId);
    if (!round || round.phase !== "scored") return;
    await startRound(ctx, sessionId);
  },
});
