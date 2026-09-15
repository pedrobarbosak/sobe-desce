import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { TWISTS, configFromPreset } from "../../src/engine";
import { as, seedUsers, setup } from "./setup";

const NAMES = ["ana", "bruno", "carla", "duarte"];

async function createPartyGame(t: ReturnType<typeof setup>) {
  await seedUsers(t, NAMES);
  const { gameId, code } = await as(t, "ana").mutation(api.games.create, { config: configFromPreset("party", { turnSeconds: 30 }) });
  for (const n of NAMES.slice(1)) await as(t, n).mutation(api.games.joinByCode, { code });
  return { gameId, code };
}

describe("party tables", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("flips a twist, keeps powerups private, and a peek opens one hand to the peeker only", async () => {
    const t = setup();
    const { gameId } = await createPartyGame(t);
    await as(t, "ana").mutation(api.sessions.start, { gameId });
    const tableFor = async (name: string) => (await as(t, name).query(api.game.table.get, { gameId }))!;
    let table = await tableFor("ana");
    expect(table.game.config.variant).toBe("party");
    expect(TWISTS).toContain(table.round!.party!.twist);
    // Pin the deal to a twist that changes nothing (golden with no suit), so the trump
    // phase exists and the scoring below is the classic one.
    await t.run(async (ctx) => {
      const round = (await ctx.db.get(table.round!._id as Id<"rounds">))!;
      await ctx.db.patch(round._id, { party: { ...round.party!, twist: "golden", goldenSuit: undefined } });
    });
    expect(table.myPowerups).toEqual([]);
    const roundId = table.round!._id as Id<"rounds">;
    const nameAtSeat = (seat: number) => table.seats[seat]!.name;

    // Hand ana a full stash; nobody else can see it.
    const anaId = table.seats[table.mySeat]!.playerId;
    await t.run((ctx) => ctx.db.patch(anaId, { powerups: ["peek", "curse", "shield"] }));
    expect((await tableFor("ana")).myPowerups).toEqual(["peek", "curse", "shield"]);
    expect((await tableFor("bruno")).myPowerups).toEqual([]);

    // Not while the trump is still open. A no-trump deal has no trump phase at all, and
    // the pin above cannot bring one back, so that case goes straight to the discards.
    if (table.round!.phase === "trump") {
      await expect(as(t, "ana").mutation(api.game.actions.usePowerup, { roundId, powerup: "shield" })).rejects.toThrow();
      await as(t, nameAtSeat(table.round!.turnSeat!)).mutation(api.game.actions.nameTrump, { roundId, suit: "S" });
    }
    table = await tableFor("ana");
    expect(table.round!.phase).toBe("discard");

    // Out of turn is fine: a peek opens the target's hand to ana and to nobody else.
    const target = (table.mySeat + 1) % 4;
    await as(t, "ana").mutation(api.game.actions.usePowerup, { roundId, powerup: "peek", target });
    table = await tableFor("ana");
    expect(table.myPowerups).toEqual(["curse", "shield"]);
    expect(table.round!.party!.peeks).toEqual([{ seat: table.mySeat, target }]);
    expect(table.openHands).toEqual([{ seat: target, cards: (await tableFor(nameAtSeat(target))).myHand }]);
    expect((await tableFor("bruno")).openHands ?? []).toEqual([]);
    await expect(as(t, "ana").mutation(api.game.actions.usePowerup, { roundId, powerup: "peek", target })).rejects.toThrow();
    // The turn did not move.
    expect(table.round!.turnSeat).toBe((table.round!.dealerSeat + 1) % 4);

    await as(t, "ana").mutation(api.game.actions.usePowerup, { roundId, powerup: "curse", target });
    await as(t, "ana").mutation(api.game.actions.usePowerup, { roundId, powerup: "shield" });
    table = await tableFor("ana");
    expect(table.myPowerups).toEqual([]);
    expect(table.round!.party!.curses[target]).toBe(1);
    expect(table.round!.party!.shielded[table.mySeat]).toBe(true);

    // Let the clock play the round out.
    let guard = 0;
    while (table.round!.phase !== "scored" && guard++ < 40) {
      await t.mutation(internal.game.timer.onTimeout, { roundId, nonce: table.round!.turnNonce });
      table = await tableFor("ana");
    }
    expect(table.round!.phase).toBe("scored");
    const cursed = table.seats[target]!;
    // The curse is the only way a seat that took tricks ends a round in the black.
    if (cursed.decision === "in" && cursed.tricksWon > 0 && table.round!.party!.twist !== "blankPays") {
      expect(cursed.delta!).toBeGreaterThan(-cursed.tricksWon * 3);
    }
    // Powerups are switched off: nothing is drawn at the end of the round.
    expect(table.round!.party!.awards).toEqual([]);

    const log = await as(t, "ana").query(api.history.actions, { roundId });
    expect(log.filter((a) => a.type === "usePowerup")).toHaveLength(3);
    expect(log.find((a) => a.type === "usePowerup")!.payload).toEqual({ powerup: "peek", target });
  });

  it("a lone human against three bots gets a party game played to the end", async () => {
    const t = setup();
    await seedUsers(t, ["ana"]);
    const { gameId } = await as(t, "ana").mutation(api.games.create, {
      config: configFromPreset("party", { startingPoints: 8, blankPenalty: 2, forcedPlayThreshold: 8, turnSeconds: 10 }),
    });
    for (let i = 0; i < 3; i++) await as(t, "ana").mutation(api.games.addBot, { gameId });
    await as(t, "ana").mutation(api.sessions.start, { gameId });
    // Upside-down and guardian rounds can push scores up for a while: give it room.
    await t.finishAllScheduledFunctions(vi.runAllTimers, 30_000);
    const view = (await as(t, "ana").query(api.games.get, { gameId }))!;
    expect(view.game.status).toBe("finished");
    const winner = view.players.find((p) => p._id === view.game.winnerPlayerId)!;
    expect(winner.score).toBe(0);
    const sessions = await as(t, "ana").query(api.history.sessions, { gameId });
    expect(sessions[0]!.roundsPlayed).toBeGreaterThan(0);
    // The deal leaves the previous twist out: never the same one two rounds running.
    const rounds = await t.run((ctx) =>
      ctx.db
        .query("rounds")
        .withIndex("by_game", (q) => q.eq("gameId", gameId))
        .collect(),
    );
    const twists = rounds.sort((a, b) => a.index - b.index).map((r) => r.party!.twist);
    expect(twists.length).toBe(sessions[0]!.roundsPlayed);
    for (let i = 1; i < twists.length; i++) expect(twists[i]).not.toBe(twists[i - 1]);
  });
});
