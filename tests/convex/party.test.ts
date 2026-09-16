import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { type Card, HIDDEN_CARD, type Suit, TWISTS, type TrickInProgress, configFromPreset, legalPlays, partyRules } from "../../src/engine";
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

describe("party twists the server has to keep secrets for", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** A party table whose round is pinned to `twist` before anyone has acted. */
  async function pinned(twist: "voteTrump" | "fog" | "blindLead" | "team" | "communism") {
    const t = setup();
    const { gameId } = await createPartyGame(t);
    await as(t, "ana").mutation(api.sessions.start, { gameId });
    const tableFor = async (name: string) => (await as(t, name).query(api.game.table.get, { gameId }))!;
    const first = await tableFor("ana");
    const roundId = first.round!._id as Id<"rounds">;
    await t.run(async (ctx) => {
      const round = (await ctx.db.get(roundId))!;
      const seatCount = round.participants.length;
      const teams = twist === "team" ? [1, 0, 3, 2] : undefined;
      const raid =
        twist === "communism"
          ? { raidTarget: [1, 2, 3, 0], raidSlots: Array.from({ length: seatCount }, () => [0, 1, 2]), raidCount: Array.from({ length: seatCount }, () => 2), raidTurn: 0, raids: [] }
          : {};
      await ctx.db.patch(roundId, {
        party: { ...round.party!, twist, goldenSuit: undefined, teams, voted: Array.from({ length: seatCount }, () => false), ...raid },
        // A vote round opens on the vote rather than on the namer.
        phase: twist === "voteTrump" ? "vote" : "trump",
        turnSeat: (round.dealerSeat + 1) % seatCount,
        darkUntil: undefined,
      });
    });
    const table = await tableFor("ana");
    const nameAt = (seat: number) => table.seats[seat]!.name;
    return { t, gameId, roundId, tableFor, nameAt, table };
  }

  /** Name the trump and keep every hand as dealt, so the tricks can start. */
  async function intoTricks(p: Awaited<ReturnType<typeof pinned>>) {
    const { t, roundId, tableFor, nameAt } = p;
    let table = await tableFor("ana");
    await as(t, nameAt(table.round!.turnSeat!)).mutation(api.game.actions.nameTrump, { roundId, suit: "S" });
    for (let i = 0; i < 4; i++) {
      table = await tableFor("ana");
      await as(t, nameAt(table.round!.turnSeat!)).mutation(api.game.actions.discard, { roundId, cards: [] });
    }
    table = await tableFor("ana");
    expect(table.round!.phase).toBe("tricks");
    return table;
  }

  /** The seat on turn plays its first legal card, as that seat's user. */
  async function playOne(p: Awaited<ReturnType<typeof pinned>>) {
    const { t, roundId, tableFor, nameAt } = p;
    const table = await tableFor("ana");
    const seat = table.round!.turnSeat!;
    const mine = await tableFor(nameAt(seat));
    const rules = partyRules(mine.round!.party! as never);
    const legal = legalPlays(mine.myHand as Card[], mine.round!.currentTrick as TrickInProgress, mine.round!.trump as Suit | null, mine.game.config.deck, rules);
    await as(t, nameAt(seat)).mutation(api.game.actions.playCard, { roundId, card: legal[0]! });
  }

  it("vote for trump: votes are taken in turn, hidden until all are in, and settle the trump", async () => {
    const p = await pinned("voteTrump");
    const { t, roundId, tableFor, nameAt } = p;
    let table = await tableFor("ana");
    expect(table.round!.phase).toBe("vote");
    const order = [1, 2, 3, 0].map((i) => (table.round!.dealerSeat + i) % 4);
    const votes: ("S" | "H")[] = ["H", "S", "H", "S"];
    for (let i = 0; i < 4; i++) {
      table = await tableFor("ana");
      expect(table.round!.turnSeat).toBe(order[i]);
      await expect(as(t, nameAt(order[(i + 1) % 4]!)).mutation(api.game.actions.vote, { roundId, suit: "S" })).rejects.toThrow();
      await as(t, nameAt(order[i]!)).mutation(api.game.actions.vote, { roundId, suit: votes[i]! });
      table = await tableFor("ana");
      if (i < 3) {
        expect(table.round!.party!.voted.filter(Boolean)).toHaveLength(i + 1);
        expect(table.round!.party).not.toHaveProperty("votes");
      }
    }
    // Two each: the first vote cast was hearts.
    expect(table.round!.phase).toBe("discard");
    expect(table.round!.trump).toBe("H");
    expect(table.round!.trumpSeat).toBeNull();
    expect((await tableFor(nameAt(order[0]!))).myHand).toHaveLength(5);
    const log = await as(t, "ana").query(api.history.actions, { roundId });
    expect(log.filter((a) => a.type === "vote")).toHaveLength(4);
    expect(log.find((a) => a.type === "vote")!.payload).toEqual({});
  });

  it("fog: trick counts and winners are hidden until the round is scored, and the lead moves left", async () => {
    const p = await pinned("fog");
    const { tableFor } = p;
    let table = await intoTricks(p);
    const leader = table.round!.currentTrick.leader;
    for (let i = 0; i < 4; i++) await playOne(p);
    table = await tableFor("ana");
    expect(table.round!.completedTricks).toHaveLength(1);
    expect(table.round!.completedTricks[0]!.winner).toBe(-1);
    expect(table.seats.every((s) => s.tricksWon === 0)).toBe(true);
    // Every card but your own is face down, in the trick played and the trick collected.
    const seen = table.round!.completedTricks[0]!.plays;
    expect(seen.filter((play) => play.card === HIDDEN_CARD)).toHaveLength(3);
    expect(seen.find((play) => play.seat === table.mySeat)!.card).not.toBe(HIDDEN_CARD);
    await playOne(p);
    const next = await tableFor("ana");
    const inPlay = next.round!.currentTrick.plays[0]!;
    expect(inPlay.card === HIDDEN_CARD || inPlay.seat === next.mySeat).toBe(true);
    expect(table.round!.currentTrick.leader).toBe((leader + 1) % 4);
    // The server itself still knows.
    const round = await p.t.run((ctx) => ctx.db.get(p.roundId));
    expect(round!.participants.reduce((n, s) => n + s.tricksWon, 0)).toBe(1);
    expect(round!.completedTricks[0]!.winner).toBeGreaterThanOrEqual(0);
  });

  it("blind lead: the lead card shows its back to everyone but its player until the trick is done", async () => {
    const p = await pinned("blindLead");
    const { tableFor, nameAt } = p;
    let table = await intoTricks(p);
    const leader = table.round!.currentTrick.leader;
    await playOne(p);
    const mine = await tableFor(nameAt(leader));
    const theirs = await tableFor(nameAt((leader + 1) % 4));
    expect(mine.round!.currentTrick.plays[0]!.card).not.toBe(HIDDEN_CARD);
    expect(theirs.round!.currentTrick.plays[0]!.card).toBe(HIDDEN_CARD);
    // A follower may play anything, whatever was led.
    for (let i = 0; i < 3; i++) await playOne(p);
    table = await tableFor("ana");
    expect(table.round!.completedTricks[0]!.plays.every((play) => play.card !== HIDDEN_CARD)).toBe(true);
  });

  it("communism: the raider alone sees the offer, and the cards change hands", async () => {
    const p = await pinned("communism");
    const { t, roundId, tableFor, nameAt } = p;
    let table = await tableFor("ana");
    await as(t, nameAt(table.round!.turnSeat!)).mutation(api.game.actions.nameTrump, { roundId, suit: "S" });
    for (let i = 0; i < 4; i++) {
      table = await tableFor("ana");
      await as(t, nameAt(table.round!.turnSeat!)).mutation(api.game.actions.discard, { roundId, cards: [] });
    }
    table = await tableFor("ana");
    expect(table.round!.phase).toBe("raid");
    const raider = table.round!.turnSeat!;
    const victim = table.round!.party!.raidVictim!;
    expect(victim).not.toBe(raider);
    const mine = await tableFor(nameAt(raider));
    const theirs = await tableFor(nameAt(victim));
    expect(mine.round!.party!.raidOffer).toHaveLength(2);
    for (const c of mine.round!.party!.raidOffer) expect(theirs.myHand).toContain(c);
    expect(theirs.round!.party!.raidOffer).toEqual([]);
    const take = mine.round!.party!.raidOffer[0]!;
    const give = mine.myHand![0]!;
    await expect(as(t, nameAt(victim)).mutation(api.game.actions.raid, { roundId, take, give })).rejects.toThrow();
    await as(t, nameAt(raider)).mutation(api.game.actions.raid, { roundId, take, give });
    expect((await tableFor(nameAt(raider))).myHand).toContain(take);
    expect((await tableFor(nameAt(victim))).myHand).toContain(give);
    table = await tableFor("ana");
    expect(table.round!.party!.raids).toEqual([{ seat: raider, target: victim }]);
    expect(table.round!.turnSeat).not.toBe(raider);
  });

  it("team: partners are public and see each other's hands from the deal", async () => {
    const p = await pinned("team");
    const { tableFor, nameAt, table } = p;
    expect(table.round!.party!.teams).toEqual([1, 0, 3, 2]);
    const me = table.mySeat;
    const partner = table.round!.party!.teams![me]!;
    expect(table.myPartner).toBe(partner);
    expect(table.openHands).toEqual([{ seat: partner, cards: (await tableFor(nameAt(partner))).myHand }]);
    const other = (me + 2) % 4;
    expect((await tableFor(nameAt(other))).openHands?.map((h) => h.seat)).toEqual([table.round!.party!.teams![other]]);
  });
});
