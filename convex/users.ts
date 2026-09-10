import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { currentUser, requireUser } from "./lib/auth";
import { MAX_DISPLAY_NAME_LENGTH } from "../src/shared/names";

export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (!user) return null;
    return {
      _id: user._id,
      displayName: user.displayName,
      avatarSeed: user.avatarSeed,
      isAnonymous: user.isAnonymous,
      email: user.email,
      locale: user.locale,
    };
  },
});

export const updateProfile = mutation({
  args: {
    displayName: v.optional(v.string()),
    avatarSeed: v.optional(v.string()),
    locale: v.optional(v.union(v.literal("pt"), v.literal("en"))),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const patch: Partial<typeof user> = {};
    if (args.displayName !== undefined) {
      const name = args.displayName.trim().slice(0, MAX_DISPLAY_NAME_LENGTH);
      if (name.length < 2) throw new Error("Name too short");
      patch.displayName = name;
    }
    if (args.avatarSeed !== undefined) patch.avatarSeed = args.avatarSeed.slice(0, 32);
    if (args.locale !== undefined) patch.locale = args.locale;
    await ctx.db.patch(user._id, patch);
    // Keep roster snapshots in sync.
    if (patch.displayName || patch.avatarSeed) {
      const memberships = await ctx.db
        .query("gamePlayers")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect();
      for (const m of memberships) {
        await ctx.db.patch(m._id, {
          name: patch.displayName ?? m.name,
          avatarSeed: patch.avatarSeed ?? m.avatarSeed,
        });
      }
    }
  },
});

/**
 * Called by the Better Auth anonymous plugin when an anonymous user signs in with a real
 * provider. Moves every game membership from the anonymous `users` row to the real one.
 * Idempotent: safe to run twice.
 */
export const linkAnonymous = internalMutation({
  args: { fromAuthId: v.string(), toAuthId: v.string() },
  handler: async (ctx, { fromAuthId, toAuthId }) => {
    if (fromAuthId === toAuthId) return;
    const from = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", fromAuthId))
      .unique();
    if (!from) return;
    const to = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", toAuthId))
      .unique();

    if (!to) {
      // The real user row does not exist yet (trigger order): promote in place.
      await ctx.db.patch(from._id, { authId: toAuthId, isAnonymous: false });
      return;
    }

    const toMemberships = await ctx.db
      .query("gamePlayers")
      .withIndex("by_user", (q) => q.eq("userId", to._id))
      .collect();
    const fromMemberships = await ctx.db
      .query("gamePlayers")
      .withIndex("by_user", (q) => q.eq("userId", from._id))
      .collect();

    // A brand-new real account adopts the anonymous identity people already know.
    if (toMemberships.length === 0) {
      await ctx.db.patch(to._id, { displayName: from.displayName, avatarSeed: from.avatarSeed });
    }
    const toGameIds = new Set(toMemberships.map((m) => m.gameId));
    for (const m of fromMemberships) {
      if (toGameIds.has(m.gameId)) {
        // Both identities are in the same game: keep the real one's seat, detach the other.
        await ctx.db.patch(m._id, { userId: undefined, status: "left" });
      } else {
        await ctx.db.patch(m._id, { userId: to._id });
      }
    }
    for await (const p of ctx.db
      .query("presence")
      .withIndex("by_game_user")
      .filter((q) => q.eq(q.field("userId"), from._id))) {
      await ctx.db.delete(p._id);
    }
    for (const g of await ctx.db
      .query("games")
      .withIndex("by_owner", (q) => q.eq("ownerId", from._id))
      .collect()) {
      await ctx.db.patch(g._id, { ownerId: to._id });
    }
    await ctx.db.delete(from._id);
  },
});
