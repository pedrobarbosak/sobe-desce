import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { configFromPreset } from "../../src/engine";
import { as, drainCleanup, seedUsers, setup } from "./setup";

describe("campaign", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("seats only checked-in players, freezes the rest, and recomputes the discard cap", async () => {
    const t = setup();
    const names = ["ana", "bruno", "carla", "duarte", "eva", "filipe", "gui"];
    await seedUsers(t, names);
    const { gameId, code } = await as(t, "ana").mutation(api.games.create, {
      config: configFromPreset("liga", { startingPoints: 40, forcedPlayThreshold: 10 }),
    });
    for (const n of names.slice(1)) await as(t, n).mutation(api.games.joinByCode, { code });
    for (const n of names.slice(0, 5)) await as(t, n).mutation(api.games.setCheckedIn, { gameId, checkedIn: true });
    await as(t, "ana").mutation(api.sessions.start, { gameId });
    const view = (await as(t, "ana").query(api.games.get, { gameId }))!;
    expect(view.session?.seatCount).toBe(5);
    expect(view.session?.maxDiscard).toBe(3); // 40-card deck, 5 seated
    expect(view.players.filter((p) => p.seat >= 0).map((p) => p.name).sort()).toEqual(names.slice(0, 5).sort());
    expect(view.players.find((p) => p.name === "gui")!.sessionsPlayed).toBe(0);
    // Roster can still grow mid-campaign.
    await seedUsers(t, ["hugo"]);
    await as(t, "hugo").mutation(api.games.joinByCode, { code });
    expect((await as(t, "ana").query(api.games.get, { gameId }))!.players).toHaveLength(8);
    // Closing the sitting mid-round abandons the round without scoring.
    await as(t, "ana").mutation(api.sessions.close, { gameId });
    const after = (await as(t, "ana").query(api.games.get, { gameId }))!;
    expect(after.session).toBeNull();
    expect(after.players.every((p) => p.score === 40)).toBe(true);
    expect(after.players.every((p) => !p.checkedIn)).toBe(true);
  });

  it("records an in-person sitting round by round with the real scoring rules", async () => {
    const t = setup();
    await seedUsers(t, ["ana", "bruno"]);
    const { gameId, code } = await as(t, "ana").mutation(api.games.create, {
      config: configFromPreset("liga", { startingPoints: 12, forcedPlayThreshold: 3 }),
    });
    await as(t, "bruno").mutation(api.games.joinByCode, { code });
    await as(t, "ana").mutation(api.games.addManualPlayer, { gameId, name: "Carla" });
    await as(t, "ana").mutation(api.games.addManualPlayer, { gameId, name: "Duarte" });
    const view = (await as(t, "ana").query(api.games.get, { gameId }))!;
    const [ana, bruno, carla, duarte] = view.players.map((p) => p._id);

    await expect(
      as(t, "bruno").mutation(api.sessions.recordManual, { gameId, playerIds: [ana!, bruno!], deltas: [{ playerId: ana!, delta: -1 }] }),
    ).rejects.toThrow(); // not the owner

    await expect(
      as(t, "ana").mutation(api.sessions.recordManual, {
        gameId,
        playerIds: [ana!, bruno!, carla!],
        rounds: [{ trump: "S", results: [{ playerId: ana!, participated: true, tricksWon: 2 }, { playerId: bruno!, participated: true, tricksWon: 2 }, { playerId: carla!, participated: true, tricksWon: 2 }] }],
      }),
    ).rejects.toThrow(); // 6 tricks

    await as(t, "ana").mutation(api.sessions.recordManual, {
      gameId,
      playerIds: [ana!, bruno!, carla!],
      note: "Sexta",
      rounds: [
        { trump: "H", results: [{ playerId: ana!, participated: true, tricksWon: 3 }, { playerId: bruno!, participated: true, tricksWon: 2 }, { playerId: carla!, participated: true, tricksWon: 0 }] },
        { trump: "S", results: [{ playerId: ana!, participated: false, tricksWon: 0 }, { playerId: bruno!, participated: true, tricksWon: 5 }, { playerId: carla!, participated: true, tricksWon: 0 }] },
      ],
    });
    const standings = (await as(t, "ana").query(api.history.standings, { gameId }))!;
    const score = (id: string) => standings.players.find((p) => p.playerId === id)!;
    expect(score(ana!).score).toBe(12 - 6); // hearts: 3 tricks × 2
    expect(score(bruno!).score).toBe(12 - 4 - 5);
    expect(score(carla!).score).toBe(12 + 10 + 5);
    expect(score(duarte!).score).toBe(12); // frozen
    expect(score(ana!).roundsPlayed).toBe(1);
    expect(score(bruno!).sessionsPlayed).toBe(1);
    expect(score(bruno!).lastSessionDelta).toBe(-9);
    expect(score(bruno!).trajectory).toEqual([12, 8, 3]);
    expect(standings.players[0]!.playerId).toBe(bruno);

    // Final deltas only, and someone reaches 0 → game over.
    const res = await as(t, "ana").mutation(api.sessions.recordManual, {
      gameId,
      playerIds: [bruno!, duarte!],
      deltas: [{ playerId: bruno!, delta: -5 }, { playerId: duarte!, delta: -2 }],
    });
    expect(res.winnerPlayerId).toBe(bruno);
    const final = (await as(t, "ana").query(api.games.get, { gameId }))!;
    expect(final.game.status).toBe("finished");
    expect(final.players.find((p) => p._id === bruno)!.score).toBe(0);
    const sessions = await as(t, "ana").query(api.history.sessions, { gameId });
    expect(sessions).toHaveLength(2);
    expect(sessions[1]!.note).toBe("Sexta");
    expect(sessions[1]!.manual).toBe(true);
  });

  it("folds a typed-in name into the account of the person it belongs to", async () => {
    const t = setup();
    await seedUsers(t, ["ana", "bruno"]);
    const { gameId, code } = await as(t, "ana").mutation(api.games.create, {
      config: configFromPreset("liga", { startingPoints: 12, forcedPlayThreshold: 3 }),
    });
    await as(t, "ana").mutation(api.games.addManualPlayer, { gameId, name: "Carla" });
    await as(t, "ana").mutation(api.games.addManualPlayer, { gameId, name: "Duarte" });

    const before = (await as(t, "ana").query(api.games.get, { gameId }))!;
    const ana = before.players.find((p) => p.name === "ana")!;
    const carla = before.players.find((p) => p.name === "Carla")!;
    const duarte = before.players.find((p) => p.name === "Duarte")!;

    // Give Carla some history, so we can prove the link keeps it.
    await as(t, "ana").mutation(api.sessions.recordManual, {
      gameId,
      playerIds: [ana._id, carla._id, duarte._id],
      deltas: [
        { playerId: carla._id, delta: -4 },
        { playerId: ana._id, delta: -1 },
      ],
    });

    // The real Carla turns up and signs in.
    await seedUsers(t, ["carla"]);
    await as(t, "carla").mutation(api.games.joinByCode, { code });
    const joined = (await as(t, "ana").query(api.games.get, { gameId }))!;
    const carlaAccount = joined.players.find((p) => p.name === "carla")!;

    await expect(
      as(t, "bruno").mutation(api.games.linkPlayer, {
        gameId,
        manualPlayerId: carla._id,
        accountPlayerId: carlaAccount._id,
      }),
    ).rejects.toThrow(/notOwner/);
    // An account that already has history in the campaign cannot absorb another one.
    await expect(
      as(t, "ana").mutation(api.games.linkPlayer, { gameId, manualPlayerId: duarte._id, accountPlayerId: ana._id }),
    ).rejects.toThrow(/accountHasHistory/);

    await as(t, "ana").mutation(api.games.linkPlayer, {
      gameId,
      manualPlayerId: carla._id,
      accountPlayerId: carlaAccount._id,
    });

    const after = (await as(t, "ana").query(api.games.get, { gameId }))!;
    expect(after.players.filter((p) => p.name === "carla")).toHaveLength(1);
    const linked = after.players.find((p) => p._id === carla._id)!;
    expect(linked.name).toBe("carla");
    expect(linked.score).toBe(8); // 12 starting points minus the 4 the typed-in row lost
    expect(linked.isMe).toBe(false);
    expect((await as(t, "carla").query(api.games.get, { gameId }))!.me!._id).toBe(carla._id);
    // Linking twice is refused rather than silently duplicating.
    await expect(
      as(t, "ana").mutation(api.games.linkPlayer, {
        gameId,
        manualPlayerId: carla._id,
        accountPlayerId: carla._id,
      }),
    ).rejects.toThrow(/cannotLinkSelf/);
  });

  it("lets someone join and check in while a sitting is already running", async () => {
    const t = setup();
    const names = ["ana", "bruno", "carla", "duarte"];
    await seedUsers(t, names);
    const { gameId, code } = await as(t, "ana").mutation(api.games.create, {
      config: configFromPreset("liga", { startingPoints: 20, forcedPlayThreshold: 5 }),
    });
    for (const n of names.slice(1)) await as(t, n).mutation(api.games.joinByCode, { code });
    for (const n of names) await as(t, n).mutation(api.games.setCheckedIn, { gameId, checkedIn: true });
    await as(t, "ana").mutation(api.sessions.start, { gameId });

    await seedUsers(t, ["eva"]);
    await as(t, "eva").mutation(api.games.joinByCode, { code });
    await as(t, "eva").mutation(api.games.setCheckedIn, { gameId, checkedIn: true });
    await as(t, "ana").mutation(api.games.addManualPlayer, { gameId, name: "Filipe" });

    const view = (await as(t, "ana").query(api.games.get, { gameId }))!;
    expect(view.session?.seatCount).toBe(4);
    const eva = view.players.find((p) => p.name === "eva")!;
    expect(eva.checkedIn).toBe(true);
    expect(eva.seat).toBe(-1); // waiting for the next sitting, not in this one
    expect(view.players.map((p) => p.name)).toContain("Filipe");
  });

  it("the host can put a latecomer on the same footing as the field", async () => {
    const t = setup();
    const names = ["ana", "bruno", "carla", "duarte"];
    await seedUsers(t, names);
    const { gameId, code } = await as(t, "ana").mutation(api.games.create, {
      config: configFromPreset("liga", { startingPoints: 40, forcedPlayThreshold: 10 }),
    });
    for (const n of names.slice(1)) await as(t, n).mutation(api.games.joinByCode, { code });
    await seedUsers(t, ["eva"]);
    await as(t, "eva").mutation(api.games.joinByCode, { code });
    const eva = (await as(t, "ana").query(api.games.get, { gameId }))!.players.find((p) => p.name === "eva")!;
    expect(eva.score).toBe(40);

    await expect(as(t, "bruno").mutation(api.games.setScore, { gameId, playerId: eva._id, score: 22 })).rejects.toThrow(/notOwner/);
    await expect(as(t, "ana").mutation(api.games.setScore, { gameId, playerId: eva._id, score: 0 })).rejects.toThrow(/scoreOutOfRange/);
    await expect(as(t, "ana").mutation(api.games.setScore, { gameId, playerId: eva._id, score: 41 })).rejects.toThrow(/scoreOutOfRange/);
    await expect(as(t, "ana").mutation(api.games.setScore, { gameId, playerId: eva._id, score: 22.5 })).rejects.toThrow(/scoreOutOfRange/);

    await as(t, "ana").mutation(api.games.setScore, { gameId, playerId: eva._id, score: 22 });
    expect((await as(t, "ana").query(api.games.get, { gameId }))!.players.find((p) => p.name === "eva")!.score).toBe(22);

    // A seat in play cannot be edited underneath the round.
    for (const n of names) await as(t, n).mutation(api.games.setCheckedIn, { gameId, checkedIn: true });
    await as(t, "ana").mutation(api.sessions.start, { gameId });
    const seated = (await as(t, "ana").query(api.games.get, { gameId }))!.players.find((p) => p.name === "bruno")!;
    await expect(as(t, "ana").mutation(api.games.setScore, { gameId, playerId: seated._id, score: 10 })).rejects.toThrow(
      /seatedInActiveSession/,
    );
    // Eva is not in this sitting, so hers is still editable.
    await as(t, "ana").mutation(api.games.setScore, { gameId, playerId: eva._id, score: 18 });
    expect((await as(t, "ana").query(api.games.get, { gameId }))!.players.find((p) => p.name === "eva")!.score).toBe(18);
  });

  it("runs a sitting without the organizer and ends it when the table empties out", async () => {
    const t = setup();
    const names = ["ana", "bruno", "carla", "duarte", "eva"];
    await seedUsers(t, names);
    // Ana owns the league but is not around tonight.
    const { gameId, code } = await as(t, "ana").mutation(api.games.create, {
      config: configFromPreset("liga", { startingPoints: 40, forcedPlayThreshold: 10 }),
    });
    for (const n of names.slice(1)) await as(t, n).mutation(api.games.joinByCode, { code });
    for (const n of names.slice(1)) await as(t, n).mutation(api.games.setCheckedIn, { gameId, checkedIn: true });

    // Three checked in is not a table.
    await as(t, "eva").mutation(api.games.setCheckedIn, { gameId, checkedIn: false });
    await expect(as(t, "bruno").mutation(api.sessions.start, { gameId })).rejects.toThrow(/notEnoughPlayers/);

    await as(t, "eva").mutation(api.games.setCheckedIn, { gameId, checkedIn: true });
    await as(t, "bruno").mutation(api.sessions.start, { gameId });
    const view = (await as(t, "bruno").query(api.games.get, { gameId }))!;
    expect(view.session?.status).toBe("active");
    expect(view.session?.seatCount).toBe(4);
    expect(view.session?.hostPlayerId).toBe(view.players.find((p) => p.name === "bruno")!._id);

    // Someone with no seat and no ownership cannot call time.
    await seedUsers(t, ["filipe"]);
    await as(t, "filipe").mutation(api.games.joinByCode, { code });
    await expect(as(t, "filipe").mutation(api.sessions.close, { gameId })).rejects.toThrow(/notOwner/);

    // One seat handed to a bot still leaves three people: not enough, so the night ends.
    await as(t, "carla").mutation(api.games.abandonSeat, { gameId });
    const after = (await as(t, "bruno").query(api.games.get, { gameId }))!;
    expect(after.session).toBeNull();
    expect(after.players.every((p) => !p.checkedIn)).toBe(true);
  });

  it("a player at the table can end the sitting, and the round in progress does not score", async () => {
    const t = setup();
    const names = ["ana", "bruno", "carla", "duarte", "eva"];
    await seedUsers(t, names);
    const { gameId, code } = await as(t, "ana").mutation(api.games.create, {
      config: configFromPreset("liga", { startingPoints: 40, forcedPlayThreshold: 10 }),
    });
    for (const n of names.slice(1)) await as(t, n).mutation(api.games.joinByCode, { code });
    for (const n of names.slice(1)) await as(t, n).mutation(api.games.setCheckedIn, { gameId, checkedIn: true });
    await as(t, "bruno").mutation(api.sessions.start, { gameId });

    // Duarte is seated but did not open the sitting, and does not own the table.
    await as(t, "duarte").mutation(api.sessions.close, { gameId });
    const after = (await as(t, "ana").query(api.games.get, { gameId }))!;
    expect(after.session).toBeNull();
    expect(after.players.every((p) => p.score === 40)).toBe(true);
  });

  it("while the organizer is in the room, only they can open the sitting", async () => {
    const t = setup();
    const names = ["ana", "bruno", "carla", "duarte", "eva"];
    await seedUsers(t, names);
    const { gameId, code } = await as(t, "ana").mutation(api.games.create, {
      config: configFromPreset("liga", { startingPoints: 40, forcedPlayThreshold: 10 }),
    });
    for (const n of names.slice(1)) await as(t, n).mutation(api.games.joinByCode, { code });
    for (const n of names.slice(1)) await as(t, n).mutation(api.games.setCheckedIn, { gameId, checkedIn: true });

    await as(t, "ana").mutation(api.presence.heartbeat, { gameId });
    const [ownerId] = await t.run(async (ctx) => {
      const owner = (await ctx.db.query("users").collect()).find((u) => u.displayName === "ana")!;
      return [owner._id];
    });
    expect(await as(t, "bruno").query(api.presence.onlineIn, { gameId })).toContain(ownerId);
    await expect(as(t, "bruno").mutation(api.sessions.start, { gameId })).rejects.toThrow(/ownerPresent/);
    // The organizer needs no seat of their own to deal.
    await as(t, "ana").mutation(api.sessions.start, { gameId });
    expect((await as(t, "ana").query(api.games.get, { gameId }))!.session?.status).toBe("active");
  });

  it("the organizer's lobby order becomes the seating order", async () => {
    const t = setup();
    const names = ["ana", "bruno", "carla", "duarte"];
    await seedUsers(t, names);
    const { gameId, code } = await as(t, "ana").mutation(api.games.create, {
      config: configFromPreset("liga", { startingPoints: 40, forcedPlayThreshold: 10 }),
    });
    for (const n of names.slice(1)) await as(t, n).mutation(api.games.joinByCode, { code });
    for (const n of names) await as(t, n).mutation(api.games.setCheckedIn, { gameId, checkedIn: true });
    const before = (await as(t, "ana").query(api.games.get, { gameId }))!;
    expect(before.players.map((p) => p.name)).toEqual(names);
    const id = (name: string) => before.players.find((p) => p.name === name)!._id;

    await expect(as(t, "bruno").mutation(api.games.setOrder, { gameId, playerIds: [id("duarte")] })).rejects.toThrow(/notOwner/);
    await as(t, "ana").mutation(api.games.setOrder, { gameId, playerIds: [id("duarte"), id("bruno")] });
    const arranged = (await as(t, "ana").query(api.games.get, { gameId }))!;
    expect(arranged.players.map((p) => p.name)).toEqual(["duarte", "bruno", "ana", "carla"]);

    await as(t, "ana").mutation(api.sessions.start, { gameId });
    const seated = (await as(t, "ana").query(api.games.get, { gameId }))!;
    expect(seated.session!.seats).toEqual([id("duarte"), id("bruno"), id("ana"), id("carla")]);
  });

  it("the organizer can strike a player from the standings for good", async () => {
    const t = setup();
    await seedUsers(t, ["ana", "bruno", "carla"]);
    const { gameId, code } = await as(t, "ana").mutation(api.games.create, {
      config: configFromPreset("liga", { startingPoints: 12, forcedPlayThreshold: 3 }),
    });
    await as(t, "bruno").mutation(api.games.joinByCode, { code });
    await as(t, "carla").mutation(api.games.joinByCode, { code });
    const view = (await as(t, "ana").query(api.games.get, { gameId }))!;
    const [ana, bruno, carla] = view.players.map((p) => p._id);
    await as(t, "ana").mutation(api.sessions.recordManual, {
      gameId,
      playerIds: [ana!, bruno!, carla!],
      deltas: [{ playerId: ana!, delta: -1 }, { playerId: bruno!, delta: -2 }, { playerId: carla!, delta: -3 }],
    });

    // Plain removal keeps them on the board, greyed out.
    await as(t, "ana").mutation(api.games.removePlayer, { gameId, playerId: bruno! });
    let standings = (await as(t, "ana").query(api.history.standings, { gameId }))!;
    expect(standings.players.find((p) => p.playerId === bruno)?.left).toBe(true);

    await as(t, "ana").mutation(api.games.removePlayer, { gameId, playerId: bruno!, permanent: true });
    await as(t, "ana").mutation(api.games.removePlayer, { gameId, playerId: carla!, permanent: true });
    standings = (await as(t, "ana").query(api.history.standings, { gameId }))!;
    expect(standings.players.map((p) => p.playerId)).toEqual([ana]);
    expect((await as(t, "ana").query(api.games.get, { gameId }))!.players).toHaveLength(1);
    // History still knows who they were.
    const sessions = await as(t, "ana").query(api.history.sessions, { gameId });
    expect(sessions[0]!.players.map((p) => p.name).sort()).toEqual(["ana", "bruno", "carla"]);
    // Coming back through the code puts them on the board again.
    await as(t, "carla").mutation(api.games.joinByCode, { code });
    expect((await as(t, "ana").query(api.games.get, { gameId }))!.players).toHaveLength(2);
  });

  it("the organizer can delete a sitting, with or without giving the points back", async () => {
    const t = setup();
    await seedUsers(t, ["ana", "bruno"]);
    const { gameId, code } = await as(t, "ana").mutation(api.games.create, {
      config: configFromPreset("liga", { startingPoints: 12, forcedPlayThreshold: 3 }),
    });
    await as(t, "bruno").mutation(api.games.joinByCode, { code });
    const view = (await as(t, "ana").query(api.games.get, { gameId }))!;
    const [ana, bruno] = view.players.map((p) => p._id);
    const record = (deltas: [number, number]) =>
      as(t, "ana").mutation(api.sessions.recordManual, {
        gameId,
        playerIds: [ana!, bruno!],
        deltas: [{ playerId: ana!, delta: deltas[0] }, { playerId: bruno!, delta: deltas[1] }],
      });
    await record([-2, -3]);
    await record([-1, +4]);
    await record([-3, -13]); // bruno hits 0: game over
    expect((await as(t, "ana").query(api.games.get, { gameId }))!.game.status).toBe("finished");
    let sessions = await as(t, "ana").query(api.history.sessions, { gameId });
    expect(sessions.map((s) => s.index)).toEqual([2, 1, 0]);
    const first = sessions[2]!._id;
    const last = sessions[0]!._id;

    await expect(as(t, "bruno").mutation(api.sessions.remove, { gameId, sessionId: first, revertScores: true })).rejects.toThrow(/notOwner/);

    // Undo the deciding night: the win goes with it and the numbers step back.
    await as(t, "ana").mutation(api.sessions.remove, { gameId, sessionId: last, revertScores: true });
    let after = (await as(t, "ana").query(api.games.get, { gameId }))!;
    expect(after.game.status).toBe("active");
    expect(after.game.winnerPlayerId).toBeUndefined();
    expect(after.players.find((p) => p._id === bruno)!.score).toBe(12 - 3 + 4);
    expect(after.players.find((p) => p._id === ana)!.sessionsPlayed).toBe(2);
    expect(after.players.find((p) => p._id === ana)!.roundsPlayed).toBe(2);

    // Drop the first night's record only: the points stay where they are.
    await as(t, "ana").mutation(api.sessions.remove, { gameId, sessionId: first, revertScores: false });
    after = (await as(t, "ana").query(api.games.get, { gameId }))!;
    expect(after.players.find((p) => p._id === bruno)!.score).toBe(12 - 3 + 4);
    sessions = await as(t, "ana").query(api.history.sessions, { gameId });
    expect(sessions.map((s) => s.index)).toEqual([0]);
    await drainCleanup(t);
    const leftovers = await t.run(async (ctx) => (await ctx.db.query("rounds").collect()).length);
    expect(leftovers).toBe(1);
  });

  it("shows the live hands to a player who passed, and to nobody else", async () => {
    const tableFor = (t: ReturnType<typeof setup>, name: string, gameId: Id<"games">) =>
      as(t, name).query(api.game.table.get, { gameId }).then((v) => v!);
    const t = setup();
    const names = ["ana", "bruno", "carla", "duarte", "eva"];
    await seedUsers(t, names);
    const { gameId, code } = await as(t, "ana").mutation(api.games.create, {
      config: configFromPreset("liga", { startingPoints: 40, forcedPlayThreshold: 10 }),
    });
    for (const n of names.slice(1)) await as(t, n).mutation(api.games.joinByCode, { code });
    // Eva is on the roster but does not check in, so she is not at the table tonight.
    for (const n of names.slice(0, 4)) await as(t, n).mutation(api.games.setCheckedIn, { gameId, checkedIn: true });
    await as(t, "ana").mutation(api.sessions.start, { gameId });

    let table = await tableFor(t, "ana", gameId);
    const roundId = table.round!._id as Id<"rounds">;
    const namer = table.seats[table.round!.turnSeat!]!.name;
    await as(t, namer).mutation(api.game.actions.nameTrump, { roundId, suit: "S" });

    // One seat passes the round; the rest play it out.
    let passer = "";
    table = await tableFor(t, "ana", gameId);
    for (let i = 0; i < 10 && table.round!.phase === "discard"; i++) {
      const turn = table.seats[table.round!.turnSeat!]!.name;
      if (turn !== namer && passer === "") {
        await as(t, turn).mutation(api.game.actions.sitOut, { roundId });
        passer = turn;
      } else {
        await as(t, turn).mutation(api.game.actions.discard, { roundId, cards: [] });
      }
      table = await tableFor(t, "ana", gameId);
    }
    expect(table.round!.phase).toBe("tricks");
    expect(passer).not.toBe("");

    // The passer has no stake left in the round, so the hands play out in front of them.
    const passerView = await tableFor(t, passer, gameId);
    expect(passerView.openHands).not.toBeNull();
    expect(passerView.openHands!.length).toBeGreaterThan(0);

    // Everyone else sees backs. Eva is the case that used to leak: a campaign takes joins
    // while a sitting is live, so any holder of the invite code could walk in mid-round
    // and read every hand at the table.
    const eva = await tableFor(t, "eva", gameId);
    expect(eva.mySeat).toBe(-1);
    expect(eva.myHand).toBeNull();
    expect(eva.openHands).toBeNull();

    await seedUsers(t, ["zeca"]);
    await as(t, "zeca").mutation(api.games.joinByCode, { code });
    const walkIn = await tableFor(t, "zeca", gameId);
    expect(walkIn.openHands).toBeNull();

    // And a player still in the round sees only their own cards.
    const stillIn = table.seats.find((s) => s.name !== namer && s.name !== passer)!.name;
    const inView = await tableFor(t, stillIn, gameId);
    expect(inView.myHand).not.toBeNull();
    expect(inView.openHands).toBeNull();
  });

  it("points a row that already has an account at a different one", async () => {
    const t = setup();
    await seedUsers(t, ["ana", "bruno"]);
    const { gameId, code } = await as(t, "ana").mutation(api.games.create, {
      config: configFromPreset("liga", { startingPoints: 12, forcedPlayThreshold: 3 }),
    });
    await as(t, "bruno").mutation(api.games.joinByCode, { code });
    const before = (await as(t, "ana").query(api.games.get, { gameId }))!;
    const ana = before.players.find((p) => p.name === "ana")!;
    const bruno = before.players.find((p) => p.name === "bruno")!;
    await as(t, "ana").mutation(api.sessions.recordManual, {
      gameId,
      playerIds: [ana._id, bruno._id],
      deltas: [{ playerId: bruno._id, delta: -4 }, { playerId: ana._id, delta: -1 }],
    });
    // Bruno comes back under a new login and lands on the roster as a stranger.
    await seedUsers(t, ["bruno2"]);
    await as(t, "bruno2").mutation(api.games.joinByCode, { code });
    const fresh = (await as(t, "ana").query(api.games.get, { gameId }))!.players.find((p) => p.name === "bruno2")!;

    await expect(
      as(t, "ana").mutation(api.games.linkPlayer, { gameId, manualPlayerId: ana._id, accountPlayerId: fresh._id }),
    ).rejects.toThrow(/cannotRelinkOwner/);
    await as(t, "ana").mutation(api.games.linkPlayer, { gameId, manualPlayerId: bruno._id, accountPlayerId: fresh._id });

    const after = (await as(t, "ana").query(api.games.get, { gameId }))!;
    expect(after.players).toHaveLength(2);
    const relinked = after.players.find((p) => p._id === bruno._id)!;
    expect(relinked.name).toBe("bruno2");
    expect(relinked.score).toBe(8);
    expect((await as(t, "bruno2").query(api.games.get, { gameId }))!.me!._id).toBe(bruno._id);
    expect((await as(t, "bruno").query(api.games.get, { gameId }))!.me).toBeNull();
    void (null as unknown as Id<"gamePlayers">);
  });

  describe("leaving a sitting", () => {
    const NAMES = ["ana", "bruno", "carla", "duarte", "eva"];
    async function sitting(t: ReturnType<typeof setup>) {
      await seedUsers(t, NAMES);
      const { gameId, code } = await as(t, "ana").mutation(api.games.create, {
        config: configFromPreset("liga", { startingPoints: 40, forcedPlayThreshold: 10, turnSeconds: 30 }),
      });
      for (const n of NAMES.slice(1)) await as(t, n).mutation(api.games.joinByCode, { code });
      for (const n of NAMES) await as(t, n).mutation(api.games.setCheckedIn, { gameId, checkedIn: true });
      await as(t, "ana").mutation(api.sessions.start, { gameId });
      return gameId;
    }
    const tableFor = (t: ReturnType<typeof setup>, name: string, gameId: Id<"games">) =>
      as(t, name).query(api.game.table.get, { gameId }).then((v) => v!);

    it("before committing to the round: the round is dealt again without them, no bot", async () => {
      const t = setup();
      const gameId = await sitting(t);
      const before = await tableFor(t, "ana", gameId);
      const firstRound = before.round!._id;
      const leaver = before.seats.find((s) => s.name !== before.seats[before.round!.turnSeat!]!.name && s.name !== "ana")!.name;

      await as(t, leaver).mutation(api.games.abandonSeat, { gameId });

      const after = await tableFor(t, "ana", gameId);
      expect(after.session!.seatCount).toBe(4);
      expect(after.seats.map((s) => s.name)).not.toContain(leaver);
      expect(after.seats.every((s) => !s.botControlled)).toBe(true);
      expect(after.round!._id).not.toBe(firstRound);
      expect(after.round!.index).toBe(0);
      expect(after.session!.maxDiscard).toBe(5); // 40 cards, 4 seated
      expect(after.round!.phase).toBe("trump");
      expect((await as(t, leaver).query(api.games.get, { gameId }))!.me!.checkedIn).toBe(false);
      // The thrown-away round left nothing behind.
      const rounds = await t.run(async (ctx) => (await ctx.db.query("rounds").collect()).length);
      expect(rounds).toBe(1);
    });

    it("already in the round: the hand is played out once, then the seat drops at the next deal", async () => {
      const t = setup();
      const gameId = await sitting(t);
      let table = await tableFor(t, "ana", gameId);
      const roundId = table.round!._id as Id<"rounds">;
      const namer = table.seats[table.round!.turnSeat!]!.name;
      await as(t, namer).mutation(api.game.actions.nameTrump, { roundId, suit: "S" });
      table = await tableFor(t, "ana", gameId);
      // The namer is committed to the round and discards nothing.
      await as(t, namer).mutation(api.game.actions.discard, { roundId, cards: [] });

      await as(t, namer).mutation(api.games.abandonSeat, { gameId });
      table = await tableFor(t, "ana", gameId);
      expect(table.round!._id).toBe(roundId); // the round goes on
      expect(table.session!.seatCount).toBe(5);
      const seat = table.seats.find((s) => s.name === namer)!;
      expect(seat.left).toBe(true);
      expect(seat.botControlled).toBe(false);
      await expect(as(t, namer).mutation(api.game.actions.sitOut, { roundId })).rejects.toThrow(/leftSitting/);
      expect(await as(t, namer).query(api.games.ongoing)).toBeNull();

      // Everyone else passes, so the namer plays the tricks alone; the server plays them.
      for (let i = 0; i < 10 && table.round!.phase === "discard"; i++) {
        const turn = table.seats[table.round!.turnSeat!]!;
        if (turn.name !== namer) await as(t, turn.name).mutation(api.game.actions.sitOut, { roundId });
        table = await tableFor(t, "ana", gameId);
      }
      for (let i = 0; i < 20 && table.round!.phase !== "scored"; i++) {
        vi.advanceTimersByTime(1_000);
        await t.finishInProgressScheduledFunctions();
        table = await tableFor(t, "ana", gameId);
      }
      expect(table.round!.phase).toBe("scored");
      const log = await as(t, "ana").query(api.history.actions, { roundId });
      expect(log.filter((a) => a.type === "play").every((a) => a.actor === "bot")).toBe(true);
      // Next deal: four at the table, the leaver gone, nobody replaced.
      vi.advanceTimersByTime(7_000);
      await t.finishInProgressScheduledFunctions();
      table = await tableFor(t, "ana", gameId);
      expect(table.round!.index).toBe(1);
      expect(table.session!.seatCount).toBe(4);
      expect(table.seats.map((s) => s.name)).not.toContain(namer);
      expect(table.seats.every((s) => !s.botControlled && !s.left)).toBe(true);
    });

    it("a tab that goes quiet leaves the sitting instead of turning into a bot, and too few seats end it", async () => {
      const t = setup();
      const gameId = await sitting(t);
      const sessionId = (await tableFor(t, "ana", gameId)).session!._id;
      vi.setSystemTime(Date.now() + 200_000);
      for (const n of NAMES.slice(1)) await as(t, n).mutation(api.presence.heartbeat, { gameId });
      await t.mutation(internal.presence.sweep, { sessionId });
      const table = await tableFor(t, "bruno", gameId);
      expect(table.session!.seatCount).toBe(4);
      expect(table.seats.map((s) => s.name)).not.toContain("ana");
      expect(table.seats.every((s) => !s.botControlled)).toBe(true);

      // Four left: one more gone and it is not a table any more.
      await as(t, "ana").mutation(api.games.kickToBot, { gameId, playerId: table.seats.find((s) => s.name === "eva")!.playerId });
      expect((await as(t, "ana").query(api.games.get, { gameId }))!.session).toBeNull();
    });
  });
});
