import { expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { as, seedUsers, setup } from "./setup";

it("preserves long generated names when saving a profile", async () => {
  const t = setup();
  await seedUsers(t, ["ana"]);
  const user = as(t, "ana");
  const displayName = "Caranguejo Brincalhão Prateado";
  await user.mutation(api.users.updateProfile, { displayName });
  expect((await user.query(api.users.me))?.displayName).toBe(displayName);
});
