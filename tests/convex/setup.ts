import { convexTest } from "convex-test";
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

export const as = (t: ReturnType<typeof setup>, name: string) => t.withIdentity({ subject: `auth_${name}` });
