import { vi } from "vitest";
import { convexTest } from "convex-test";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";

export const modules = import.meta.glob("../../convex/**/*.ts");

export function setup() {
  return convexTest(schema, modules);
}

export async function seedUsers(t: ReturnType<typeof setup>, names: string[]) {
  const ids = [];
  for (const name of names) {
    const id = await t.run((ctx) =>
      ctx.db.insert("users", { authId: `auth_${name}`, displayName: name, avatarSeed: name, isAnonymous: true }),
    );
    ids.push(id);
  }
  return ids;
}

/**
 * A tab that never stops reporting in, for tests that fast-forward through a whole game: a
 * real one beats every 15 seconds, which a jump of the fake clock would skip, and the sweep
 * would take the seat. Without anyone present the bots stop and wait, by design.
 */
export async function keepTabOpen(t: ReturnType<typeof setup>, gameId: Id<"games">, userId: Id<"users">) {
  await t.run((ctx) => ctx.db.insert("presence", { gameId, userId, lastSeenAt: Number.MAX_SAFE_INTEGER }));
}

export const as =(t: ReturnType<typeof setup>, name: string) => t.withIdentity({ subject: `auth_${name}` });

/**
 * Throwing a table or a sitting away sweeps its rounds in scheduled passes rather than
 * inline, because a long campaign has more rows behind it than one transaction may delete.
 * Anything asserting that those rows are gone has to let the sweep finish first.
 */
export async function drainCleanup(t: ReturnType<typeof setup>) {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}
