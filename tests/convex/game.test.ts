import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { type Card, type TrickInProgress, configFromPreset, legalPlays } from "../../src/engine";
import { as, keepTabOpen, seedUsers, setup } from "./setup";

const NAMES = ["ana", "bruno", "carla", "duarte"];

async function createFourPlayerGame(t: ReturnType<typeof setup>) {
  await seedUsers(t, NAMES);
  const { gameId, code } = await as(t, "ana").mutation(api.games.create, { config: configFromPreset("normal", { turnSeconds: 30 }) });
  for (const n of NAMES.slice(1)) await as(t, n).mutation(api.games.joinByCode, { code });
  return { gameId, code };
}

describe("lobby", () => {
  it("creates a game, joins by code and rejects a fifth player", async () => {
    const t = setup();
    const { gameId, code } = await createFourPlayerGame(t);
    const view = await as(t, "ana").query(api.games.get, { gameId });
    expect(view?.players).toHaveLength(4);
    expect(view?.isOwner).toBe(true);
    await seedUsers(t, ["eva"]);
    await expect(as(t, "eva").mutation(api.games.joinByCode, { code })).rejects.toThrow();
    // joining twice is idempotent
    await as(t, "bruno").mutation(api.games.joinByCode, { code });
    expect((await as(t, "ana").query(api.games.get, { gameId }))?.players).toHaveLength(4);
  });

  it("only the owner can start and it needs four players", async () => {
    const t = setup();
    await seedUsers(t, NAMES);
    const { gameId, code } = await as(t, "ana").mutation(api.games.create, { config: configFromPreset("normal") });
    await expect(as(t, "ana").mutation(api.sessions.start, { gameId })).rejects.toThrow();
    for (const n of NAMES.slice(1)) await as(t, n).mutation(api.games.joinByCode, { code });
    await expect(as(t, "bruno").mutation(api.sessions.start, { gameId })).rejects.toThrow();
    await as(t, "ana").mutation(api.sessions.start, { gameId });
    const view = await as(t, "ana").query(api.games.get, { gameId });
    expect(view?.game.status).toBe("active");
    expect(view?.session?.seatCount).toBe(4);
    expect(view?.session?.maxDiscard).toBe(5);
  });
});

describe("a full round", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("deals privately, validates every move, scores and logs actions", async () => {
    const t = setup();
    const { gameId } = await createFourPlayerGame(t);
    await as(t, "ana").mutation(api.sessions.start, { gameId });

    const tableFor = async (name: string) => (await as(t, name).query(api.game.table.get, { gameId }))!;
    let table = await tableFor("ana");
    expect(table.round?.phase).toBe("trump");
    expect(table.seats.filter((s) => s.handSize === 3)).toHaveLength(4);

    // The seat that settles the trump is held in the dark until its window closes; the
    // three cards exist on the server but are not sent to them.
    const blindName = table.seats[table.round!.turnSeat!]!.name;
    const blind = await tableFor(blindName);
    expect(blind.inTheDark).toBe(true);
    expect(blind.myHand).toBeNull();
    expect(blind.seats[blind.mySeat]!.handSize).toBe(3);

    // Everyone else sees only their own hand, and they are all different.
    const hands = new Set<string>();
    for (const n of NAMES.filter((n) => n !== blindName)) {
      const v = await tableFor(n);
      expect(v.inTheDark).toBe(false);
      expect(v.myHand).toHaveLength(3);
      hands.add(v.myHand!.join(","));
    }
    expect(hands.size).toBe(3);
    const spectator = await seedUsers(t, ["zeca"]);
    expect(spectator).toHaveLength(1);
    expect((await tableFor("zeca")).myHand).toBeNull();

    const nameAtSeat = (seat: number) => table.seats[seat]!.name;
    const roundId = table.round!._id as Id<"rounds">;

    // Wrong player cannot name trump.
    const notTurn = NAMES.find((n) => n !== nameAtSeat(table.round!.turnSeat!))!;
    await expect(as(t, notTurn).mutation(api.game.actions.nameTrump, { roundId, suit: "S" })).rejects.toThrow();
    await as(t, nameAtSeat(table.round!.turnSeat!)).mutation(api.game.actions.nameTrump, { roundId, suit: "S" });

    table = await tableFor("ana");
    expect(table.round?.phase).toBe("discard");
    expect(table.myHand).toHaveLength(5);

    // Discard phase: first player discards 2, the rest keep their cards.
    let first = true;
    while (table.round!.phase === "discard") {
      const who = nameAtSeat(table.round!.turnSeat!);
      const mine = (await tableFor(who)).myHand as Card[];
      if (first) {
        await expect(as(t, who).mutation(api.game.actions.discard, { roundId, cards: [mine[0]!, mine[0]!] })).rejects.toThrow();
        await as(t, who).mutation(api.game.actions.discard, { roundId, cards: mine.slice(0, 2) });
        const after = (await tableFor(who)).myHand!;
        expect(after).toHaveLength(5);
        expect(after).not.toContain(mine[0]);
        first = false;
      } else {
        await as(t, who).mutation(api.game.actions.discard, { roundId, cards: [] });
      }
      table = await tableFor("ana");
    }
    expect(table.round!.phase).toBe("tricks");

    // Play: always the lowest legal card; an illegal card (if any) must be rejected.
    let plays = 0;
    while (table.round!.phase === "tricks") {
      const who = nameAtSeat(table.round!.turnSeat!);
      const mine = (await tableFor(who)).myHand as Card[];
      const legal = legalPlays(mine, table.round!.currentTrick as TrickInProgress, "S", 40);
      const illegal = mine.find((c) => !legal.includes(c));
      if (illegal) {
        await expect(as(t, who).mutation(api.game.actions.playCard, { roundId, card: illegal })).rejects.toThrow();
      }
      await as(t, who).mutation(api.game.actions.playCard, { roundId, card: legal[0]! });
      plays++;
      table = await tableFor("ana");
    }
    expect(plays).toBe(20);
    expect(table.round!.phase).toBe("scored");
    expect(table.round!.completedTricks).toHaveLength(5);
    const tricks = table.seats.reduce((n, s) => n + s.tricksWon, 0);
    expect(tricks).toBe(5);
    for (const s of table.seats) {
      const expected = s.tricksWon === 0 ? 5 : -s.tricksWon;
      expect(s.delta).toBe(expected);
      expect(s.scoreAfter).toBe(Math.max(0, 20 + expected));
      expect(s.score).toBe(s.scoreAfter);
    }

    const log = await as(t, "ana").query(api.history.actions, { roundId });
    expect(log).toHaveLength(1 + 4 + 20);
    expect(log[0]).toMatchObject({ type: "nameTrump", actor: "user", payload: { suit: "S" } });
    expect(log[1]!.payload).toEqual({ count: 2 }); // discards are redacted to a count
    expect(log.map((a) => a.seq)).toEqual([...Array(25).keys()]);

    // The next round is dealt after the delay (only the queued deal runs, not the new timers).
    vi.advanceTimersByTime(7_000);
    await t.finishInProgressScheduledFunctions();
    table = await tableFor("ana");
    expect(table.round!.index).toBe(1);
    expect(table.round!.phase).toBe("trump");
    expect(table.round!.dealerSeat).toBe((table.session!.dealerSeat + 0) % 4);
    // Whoever settles the trump is held in the dark again; anyone else already has three.
    const blindNow = table.seats[table.round!.turnSeat!]!.name;
    expect((await tableFor(NAMES.find((n) => n !== blindNow)!)).myHand).toHaveLength(3);
  });
});

describe("timers and bots", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("auto-plays on timeout and ignores stale timers", async () => {
    const t = setup();
    const { gameId } = await createFourPlayerGame(t);
    await as(t, "ana").mutation(api.sessions.start, { gameId });
    let table = (await as(t, "ana").query(api.game.table.get, { gameId }))!;
    const roundId = table.round!._id as Id<"rounds">;
    const nonce = table.round!.turnNonce;

    // A stale nonce is a no-op.
    await t.mutation(internal.game.timer.onTimeout, { roundId, nonce: nonce - 1 });
    table = (await as(t, "ana").query(api.game.table.get, { gameId }))!;
    expect(table.round!.phase).toBe("trump");

    // The real one names trump for the player.
    await t.mutation(internal.game.timer.onTimeout, { roundId, nonce });
    table = (await as(t, "ana").query(api.game.table.get, { gameId }))!;
    expect(table.round!.phase).toBe("discard");
    expect(table.round!.turnNonce).toBe(nonce + 1);
    const log = await as(t, "ana").query(api.history.actions, { roundId });
    expect(log[0]!.actor).toBe("timeout");
  });

  it("drops the timer of a turn that ended, but never the one it is running under", async () => {
    const t = setup();
    const { gameId } = await createFourPlayerGame(t);
    await as(t, "ana").mutation(api.sessions.start, { gameId });
    const stateOf = async (id: Id<"_scheduled_functions">) => (await t.run((ctx) => ctx.db.system.get(id)))!.state.kind;
    const timerOf = async (roundId: Id<"rounds">) => (await t.run((ctx) => ctx.db.get(roundId)))!.timerId!;
    let table = (await as(t, "ana").query(api.game.table.get, { gameId }))!;
    const roundId = table.round!._id as Id<"rounds">;
    const first = await timerOf(roundId);
    expect(await stateOf(first)).toBe("pending");
    // The timer itself moves the turn on: it must not cancel the job it is running as.
    await t.mutation(internal.game.timer.onTimeout, { roundId, nonce: table.round!.turnNonce });
    const second = await timerOf(roundId);
    expect(second).not.toBe(first);
    expect(await stateOf(first)).toBe("pending");
    // A player moves: the timer armed for their turn is cancelled and a fresh one armed.
    table = (await as(t, "ana").query(api.game.table.get, { gameId }))!;
    const onTurn = table.seats[table.round!.turnSeat!]!.name;
    await as(t, onTurn).mutation(api.game.actions.discard, { roundId, cards: [] });
    expect(await stateOf(second)).toBe("canceled");
    expect(await stateOf(await timerOf(roundId))).toBe("pending");
  });

  it("a lone human against three bots gets played to the end by the server", async () => {
    const t = setup();
    const [anaId] = await seedUsers(t, ["ana"]);
    // Small, deterministic-length game: no blank-round bonus, so every round removes 5 points.
    const { gameId } = await as(t, "ana").mutation(api.games.create, {
      config: configFromPreset("custom", { startingPoints: 6, blankPenalty: 0, forcedPlayThreshold: 6, turnSeconds: 10 }),
    });
    for (let i = 0; i < 3; i++) await as(t, "ana").mutation(api.games.addBot, { gameId });
    await keepTabOpen(t, gameId, anaId!);
    await as(t, "ana").mutation(api.sessions.start, { gameId });
    // Timers auto-play the human, bots play themselves, rounds chain until someone hits 0.
    await t.finishAllScheduledFunctions(vi.runAllTimers, 5_000);
    const view = (await as(t, "ana").query(api.games.get, { gameId }))!;
    expect(view.game.status).toBe("finished");
    expect(view.game.winnerPlayerId).toBeDefined();
    const winner = view.players.find((p) => p._id === view.game.winnerPlayerId)!;
    expect(winner.score).toBe(0);
    expect(view.players.every((p) => p.score >= 0)).toBe(true);
    const sessions = await as(t, "ana").query(api.history.sessions, { gameId });
    expect(sessions[0]!.status).toBe("finished");
    expect(sessions[0]!.roundsPlayed).toBeGreaterThan(0);
  });
});

describe("tables nobody is playing", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** Ana and three bots, dealt in. */
  async function againstBots(t: ReturnType<typeof setup>) {
    const [anaId] = await seedUsers(t, ["ana"]);
    const { gameId } = await as(t, "ana").mutation(api.games.create, { config: configFromPreset("normal", { turnSeconds: 30 }) });
    for (let i = 0; i < 3; i++) await as(t, "ana").mutation(api.games.addBot, { gameId });
    await as(t, "ana").mutation(api.sessions.start, { gameId });
    const table = (await as(t, "ana").query(api.game.table.get, { gameId }))!;
    return { gameId, anaId: anaId!, sessionId: table.session!._id, roundId: table.round!._id as Id<"rounds"> };
  }
  const roundOf = (t: ReturnType<typeof setup>, roundId: Id<"rounds">) => t.run((ctx) => ctx.db.get(roundId)).then((r) => r!);
  const jobOf = (t: ReturnType<typeof setup>, id: Id<"_scheduled_functions">) => t.run((ctx) => ctx.db.system.get(id)).then((j) => j!);

  it("a bot's turn schedules the bot's move and no clock", async () => {
    const t = setup();
    const { gameId, anaId, roundId } = await againstBots(t);
    await keepTabOpen(t, gameId, anaId);
    const table = (await as(t, "ana").query(api.game.table.get, { gameId }))!;
    // Hand the turn on until it sits with a bot.
    let round = await roundOf(t, roundId);
    for (let guard = 0; table.seats[round.turnSeat!]!.name === "ana" && guard < 5; guard++) {
      await t.mutation(internal.game.timer.onTimeout, { roundId, nonce: round.turnNonce });
      round = await roundOf(t, roundId);
    }
    expect(table.seats[round.turnSeat!]!.isBot).toBe(true);
    expect(round.turnDeadline).toBeUndefined();
    expect((await jobOf(t, round.timerId!)).name).toMatch(/bots/);
    // Ana's own clocks may still be pending (the test calls onTimeout directly, rather than
    // letting them fire); none is armed for the bot's turn.
    const clocksForThisTurn = await t.run((ctx) =>
      ctx.db.system
        .query("_scheduled_functions")
        .collect()
        .then((jobs) =>
          jobs.filter((j) => j.state.kind === "pending" && j.name.includes("timer") && (j.args[0] as { nonce: number }).nonce === round.turnNonce),
        ),
    );
    expect(clocksForThisTurn).toHaveLength(0);
  });

  it("the bots stop when the last person drops off, and carry on when they are back", async () => {
    const t = setup();
    const { gameId, sessionId, roundId } = await againstBots(t);
    vi.setSystemTime(Date.now() + 200_000);
    await t.mutation(internal.presence.sweep, { sessionId });
    let seats = (await as(t, "ana").query(api.game.table.get, { gameId }))!.seats;
    expect(seats.find((s) => s.name === "ana")!.botReason).toBe("disconnected");

    // One more move and the table is all bots: it waits instead of playing on.
    await t.mutation(internal.game.bots.act, { roundId, nonce: (await roundOf(t, roundId)).turnNonce });
    let round = await roundOf(t, roundId);
    expect(round.phase).not.toBe("scored");
    expect(round.timerId).toBeUndefined();
    expect(round.turnDeadline).toBeUndefined();
    expect((await as(t, "ana").query(api.games.get, { gameId }))!.game.status).toBe("active");

    // Her tab reports in: the seat is hers again and the table moves.
    await as(t, "ana").mutation(api.presence.heartbeat, { gameId });
    seats = (await as(t, "ana").query(api.game.table.get, { gameId }))!.seats;
    expect(seats.find((s) => s.name === "ana")!.botControlled).toBe(false);
    round = await roundOf(t, roundId);
    expect(round.timerId).toBeDefined();
  });

  it("a table everyone gave up on ends instead of playing itself out", async () => {
    const t = setup();
    const { gameId, roundId } = await againstBots(t);
    await as(t, "ana").mutation(api.games.abandonSeat, { gameId });
    await t.mutation(internal.game.bots.act, { roundId, nonce: (await roundOf(t, roundId)).turnNonce });
    const view = (await as(t, "ana").query(api.games.get, { gameId }))!;
    expect(view.game.status).toBe("finished");
    expect(view.game.winnerPlayerId).toBeUndefined();
    expect((await roundOf(t, roundId)).phase).toBe("scored");
  });

  it("the hourly sweep ends sittings left alone for half a day, and old lobbies", async () => {
    const t = setup();
    const { gameId: playing } = await createFourPlayerGame(t);
    await as(t, "ana").mutation(api.sessions.start, { gameId: playing });
    const { gameId: lobby } = await as(t, "ana").mutation(api.games.create, { config: configFromPreset("normal", {}) });

    vi.setSystemTime(Date.now() + 60 * 60_000);
    await t.mutation(internal.maintenance.sweepStale, {});
    expect((await as(t, "ana").query(api.games.get, { gameId: playing }))!.game.status).toBe("active");

    vi.setSystemTime(Date.now() + 8 * 24 * 60 * 60_000);
    await t.mutation(internal.maintenance.sweepStale, {});
    expect((await as(t, "ana").query(api.games.get, { gameId: playing }))!.game.status).toBe("finished");
    expect(await t.run((ctx) => ctx.db.get(lobby))).toBeNull();
  });
});
