import { expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { configFromPreset } from "../../src/engine";
import { as, seedUsers, setup } from "./setup";

it("preserves long generated names when saving a profile", async () => {
  const t = setup();
  await seedUsers(t, ["ana"]);
  const user = as(t, "ana");
  const displayName = "Caranguejo Brincalhão Prateado";
  await user.mutation(api.users.updateProfile, { displayName });
  expect((await user.query(api.users.me))?.displayName).toBe(displayName);
});

it("linking a guest to an account keeps the row that carries the history", async () => {
  const t = setup();
  await seedUsers(t, ["ana", "guest", "real"]);
  const { gameId, code } = await as(t, "ana").mutation(api.games.create, {
    config: configFromPreset("liga", { startingPoints: 12, forcedPlayThreshold: 3 }),
  });
  await as(t, "guest").mutation(api.games.joinByCode, { code });
  const before = (await as(t, "ana").query(api.games.get, { gameId }))!;
  const ana = before.players.find((p) => p.name === "ana")!;
  const guest = before.players.find((p) => p.name === "guest")!;
  await as(t, "ana").mutation(api.sessions.recordManual, {
    gameId,
    playerIds: [ana._id, guest._id],
    deltas: [{ playerId: guest._id, delta: -4 }, { playerId: ana._id, delta: -1 }],
  });
  // The same person had already opened the invite link while signed in with Discord.
  await as(t, "real").mutation(api.games.joinByCode, { code });
  expect((await as(t, "ana").query(api.games.get, { gameId }))!.players).toHaveLength(3);

  await t.mutation(internal.users.linkAnonymous, { fromAuthId: "auth_guest", toAuthId: "auth_real" });

  const after = (await as(t, "ana").query(api.games.get, { gameId }))!;
  expect(after.players).toHaveLength(2);
  const mine = (await as(t, "real").query(api.games.get, { gameId }))!.me!;
  expect(mine._id).toBe(guest._id);
  expect(mine.score).toBe(8);
});
