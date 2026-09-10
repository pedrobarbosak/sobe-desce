import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { configFromPreset } from "../../src/engine";
import { as, seedUsers, setup } from "./setup";

const NAMES = ["ana", "bruno", "carla", "duarte"];

async function seatedGame(t: ReturnType<typeof setup>) {
  await seedUsers(t, NAMES);
  const { gameId, code } = await as(t, "ana").mutation(api.games.create, {
    config: configFromPreset("normal", { turnSeconds: 30 }),
  });
  for (const n of NAMES.slice(1)) await as(t, n).mutation(api.games.joinByCode, { code });
  await as(t, "ana").mutation(api.sessions.start, { gameId });
  return gameId;
}

const tableFor = (t: ReturnType<typeof setup>, name: string, gameId: Id<"games">) =>
  as(t, name).query(api.game.table.get, { gameId }).then((v) => v!);

describe("the trump namer is committed", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("cannot sit the round out, but the next seat can", async () => {
    const t = setup();
    const gameId = await seatedGame(t);
    let table = await tableFor(t, "ana", gameId);
    const roundId = table.round!._id as Id<"rounds">;
    const nameAt = (seat: number) => table.seats[seat]!.name;

    const namer = nameAt(table.round!.turnSeat!);
    await as(t, namer).mutation(api.game.actions.nameTrump, { roundId, suit: "S" });

    table = await tableFor(t, "ana", gameId);
    expect(table.round!.trumpSeat).toBe(table.round!.turnSeat);
    await expect(as(t, namer).mutation(api.game.actions.sitOut, { roundId })).rejects.toThrow(
      /sitOutTrumpNamer/,
    );

    await as(t, namer).mutation(api.game.actions.discard, { roundId, cards: [] });
    table = await tableFor(t, "ana", gameId);
    const next = nameAt(table.round!.turnSeat!);
    await as(t, next).mutation(api.game.actions.sitOut, { roundId });
    table = await tableFor(t, "ana", gameId);
    expect(table.seats.find((s) => s.name === next)!.decision).toBe("out");
  });
});

describe("flipping for the trump", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("reveals the card to the whole table and leaves the flipper free to pass", async () => {
    const t = setup();
    const gameId = await seatedGame(t);
    let table = await tableFor(t, "ana", gameId);
    const roundId = table.round!._id as Id<"rounds">;
    const flipper = table.seats[table.round!.turnSeat!]!.name;

    await as(t, flipper).mutation(api.game.actions.flipTrump, { roundId });

    table = await tableFor(t, "ana", gameId);
    expect(table.round!.flipped).not.toBeNull();
    expect(table.round!.trump).toBe(table.round!.flipped!.slice(-1));
    expect(table.round!.trumpSeat).toBe(table.round!.turnSeat);
    // The flipped card is one of the flipper's own, and it is public.
    const theirHand = (await tableFor(t, flipper, gameId)).myHand!;
    expect(theirHand).toContain(table.round!.flipped);
    // A spectator sees the flip without seeing any hand.
    await seedUsers(t, ["zeca"]);
    const spectator = await tableFor(t, "zeca", gameId);
    expect(spectator.round!.flipped).toBe(table.round!.flipped);
    expect(spectator.myHand).toBeNull();

    if (table.round!.trump === "C") return; // clubs stop everyone; covered elsewhere
    await as(t, flipper).mutation(api.game.actions.sitOut, { roundId });
    expect((await tableFor(t, "ana", gameId)).seats[table.round!.trumpSeat!]!.decision).toBe("out");
  });

  it("is logged as its own move", async () => {
    const t = setup();
    const gameId = await seatedGame(t);
    const table = await tableFor(t, "ana", gameId);
    const roundId = table.round!._id as Id<"rounds">;
    await as(t, table.seats[table.round!.turnSeat!]!.name).mutation(api.game.actions.flipTrump, { roundId });
    const log = await as(t, "ana").query(api.history.actions, { roundId });
    expect(log[0]!.type).toBe("flipTrump");
    expect(log[0]!.actor).toBe("user");
  });
});

describe("hearts in the dark", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const blindSeatName = (table: Awaited<ReturnType<typeof tableFor>>) => table.seats[table.round!.turnSeat!]!.name;

  it("calls hearts blind, pays fourfold, and deals the caller a full hand", async () => {
    const t = setup();
    const gameId = await seatedGame(t);
    let table = await tableFor(t, "ana", gameId);
    const roundId = table.round!._id as Id<"rounds">;
    const caller = blindSeatName(table);
    expect((await tableFor(t, caller, gameId)).myHand).toBeNull();

    await as(t, caller).mutation(api.game.actions.darkHearts, { roundId });

    table = await tableFor(t, "ana", gameId);
    expect(table.round!.trump).toBe("H");
    expect(table.round!.darkHearts).toBe(true);
    expect(table.round!.phase).toBe("discard");
    expect(table.round!.darkUntil).toBeNull();
    // The caller now holds all five, and can see them.
    const hand = (await tableFor(t, caller, gameId)).myHand!;
    expect(hand).toHaveLength(5);
    expect((await tableFor(t, caller, gameId)).inTheDark).toBe(false);
    const log = await as(t, "ana").query(api.history.actions, { roundId });
    expect(log[0]!.type).toBe("darkHearts");
  });

  it("closes the window on time and hands the cards over", async () => {
    const t = setup();
    const gameId = await seatedGame(t);
    const table = await tableFor(t, "ana", gameId);
    const roundId = table.round!._id as Id<"rounds">;
    const caller = blindSeatName(table);

    vi.advanceTimersByTime(11_000);
    await t.finishInProgressScheduledFunctions();

    const after = await tableFor(t, caller, gameId);
    expect(after.inTheDark).toBe(false);
    expect(after.myHand).toHaveLength(3);
    await expect(as(t, caller).mutation(api.game.actions.darkHearts, { roundId })).rejects.toThrow(/darkWindowClosed/);
  });

  it("can be given up early to take the cards now", async () => {
    const t = setup();
    const gameId = await seatedGame(t);
    const table = await tableFor(t, "ana", gameId);
    const roundId = table.round!._id as Id<"rounds">;
    const caller = blindSeatName(table);

    await as(t, caller).mutation(api.game.actions.revealHand, { roundId });
    const after = await tableFor(t, caller, gameId);
    expect(after.inTheDark).toBe(false);
    expect(after.myHand).toHaveLength(3);
    await expect(as(t, caller).mutation(api.game.actions.darkHearts, { roundId })).rejects.toThrow(/darkWindowClosed/);
    // Naming a suit the ordinary way still works.
    await as(t, caller).mutation(api.game.actions.nameTrump, { roundId, suit: "S" });
    expect((await tableFor(t, "ana", gameId)).round!.trump).toBe("S");
  });
});

describe("handing a seat to a bot", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("the host can kick a seated player and the stand-in keeps their points", async () => {
    const t = setup();
    const gameId = await seatedGame(t);
    await expect(
      as(t, "bruno").mutation(api.games.kickToBot, { gameId, playerId: (await tableFor(t, "ana", gameId)).seats[0]!.playerId }),
    ).rejects.toThrow(/notOwner/);

    const before = await tableFor(t, "ana", gameId);
    const victim = before.seats.find((s) => s.name === "carla")!;
    await as(t, "ana").mutation(api.games.kickToBot, { gameId, playerId: victim.playerId });

    const after = await tableFor(t, "ana", gameId);
    const seat = after.seats.find((s) => s.name === "carla")!;
    expect(seat.botControlled).toBe(true);
    expect(seat.botReason).toBe("kicked");
    expect(seat.score).toBe(victim.score);
    // Carla can still watch, but the seat no longer answers to her.
    const roundId = after.round!._id as Id<"rounds">;
    await expect(as(t, "carla").mutation(api.game.actions.nameTrump, { roundId, suit: "S" })).rejects.toThrow();
  });

  it("abandoning your own seat hands it over without touching the roster score", async () => {
    const t = setup();
    const gameId = await seatedGame(t);
    const before = (await tableFor(t, "ana", gameId)).seats.find((s) => s.name === "duarte")!;
    await as(t, "duarte").mutation(api.games.abandonSeat, { gameId });
    const seat = (await tableFor(t, "ana", gameId)).seats.find((s) => s.name === "duarte")!;
    expect(seat.botControlled).toBe(true);
    expect(seat.botReason).toBe("abandoned");
    expect(seat.score).toBe(before.score);
    expect(await as(t, "duarte").query(api.games.ongoing)).toBeNull();
  });

  it("a tab that stops reporting in for a minute loses the seat", async () => {
    const t = setup();
    const gameId = await seatedGame(t);
    vi.setSystemTime(Date.now() + 61_000);
    // Only bruno's tab is still checking in.
    await as(t, "bruno").mutation(api.presence.heartbeat, { gameId });
    await t.mutation(internal.presence.sweep, { sessionId: (await tableFor(t, "ana", gameId)).session!._id });

    const seats = (await tableFor(t, "ana", gameId)).seats;
    expect(seats.find((s) => s.name === "bruno")!.botControlled).toBe(false);
    for (const name of ["ana", "carla", "duarte"]) {
      const seat = seats.find((s) => s.name === name)!;
      expect(seat.botControlled).toBe(true);
      expect(seat.botReason).toBe("disconnected");
    }
  });
});

describe("throwing a table away", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("only the host can delete, and it takes the rounds with it", async () => {
    const t = setup();
    const gameId = await seatedGame(t);
    await expect(as(t, "bruno").mutation(api.games.remove, { gameId })).rejects.toThrow(/notOwner/);

    await as(t, "ana").mutation(api.games.remove, { gameId });
    expect(await as(t, "ana").query(api.games.get, { gameId })).toBeNull();
    expect(await as(t, "bruno").query(api.games.ongoing)).toBeNull();
    const leftovers = await t.run(async (ctx) => ({
      rounds: (await ctx.db.query("rounds").collect()).length,
      hands: (await ctx.db.query("hands").collect()).length,
      secrets: (await ctx.db.query("roundSecrets").collect()).length,
      actions: (await ctx.db.query("actions").collect()).length,
      sessions: (await ctx.db.query("sessions").collect()).length,
      players: (await ctx.db.query("gamePlayers").collect()).length,
    }));
    expect(leftovers).toEqual({ rounds: 0, hands: 0, secrets: 0, actions: 0, sessions: 0, players: 0 });
  });

  it("a lobby left to the bots deletes itself when the last human walks out", async () => {
    const t = setup();
    await seedUsers(t, ["ana"]);
    const { gameId } = await as(t, "ana").mutation(api.games.create, { config: configFromPreset("normal") });
    for (let i = 0; i < 3; i++) await as(t, "ana").mutation(api.games.addBot, { gameId });

    await as(t, "ana").mutation(api.games.leave, { gameId });
    expect(await as(t, "ana").query(api.games.get, { gameId })).toBeNull();
  });

  it("keeps the table while another human is still enrolled", async () => {
    const t = setup();
    const gameId = await seatedGame(t);
    await as(t, "duarte").mutation(api.games.leave, { gameId });
    expect(await as(t, "ana").query(api.games.get, { gameId })).not.toBeNull();
  });
});
