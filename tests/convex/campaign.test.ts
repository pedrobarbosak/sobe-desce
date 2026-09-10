import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { configFromPreset } from "../../src/engine";
import { as, seedUsers, setup } from "./setup";

describe("campaign", () => {
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
});
