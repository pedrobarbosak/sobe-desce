import { createClient, type AuthFunctions, type GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { anonymous } from "better-auth/plugins/anonymous";
import { magicLink } from "better-auth/plugins/magic-link";
import { genericOAuth, microsoftEntraId } from "better-auth/plugins/generic-oauth";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import authConfig from "./auth.config";
import { randomName, seedFromName } from "../src/shared/names";
import { sendMagicLinkEmail } from "./lib/email";

const siteUrl = process.env.SITE_URL ?? "http://localhost:5173";
/**
 * Where OAuth providers send people back. Behind a tunnel the backend only knows its own
 * loopback address, which no provider can reach, so the public host is set explicitly.
 */
const authBaseUrl = process.env.AUTH_BASE_URL ?? process.env.CONVEX_SITE_URL;

const authFunctions: AuthFunctions = internal.auth;

export const authComponent = createClient<DataModel>(components.betterAuth, {
  authFunctions,
  triggers: {
    user: {
      onCreate: async (ctx, doc) => {
        const isAnonymous = Boolean((doc as { isAnonymous?: boolean }).isAnonymous);
        // linkAnonymous may already have promoted the guest row to this auth id; a second
        // row under the same id would make every by_authId lookup throw from then on.
        const existing = await ctx.db
          .query("users")
          .withIndex("by_authId", (q) => q.eq("authId", doc._id))
          .unique();
        if (existing) {
          if (!isAnonymous && (existing.isAnonymous || existing.email !== doc.email)) {
            await ctx.db.patch(existing._id, { isAnonymous: false, email: doc.email });
          }
          return;
        }
        const displayName = doc.name || randomName();
        await ctx.db.insert("users", {
          authId: doc._id,
          displayName,
          avatarSeed: seedFromName(displayName),
          isAnonymous,
          email: isAnonymous ? undefined : doc.email,
        });
      },
      onUpdate: async (ctx, newDoc) => {
        const user = await ctx.db
          .query("users")
          .withIndex("by_authId", (q) => q.eq("authId", newDoc._id))
          .unique();
        if (!user) return;
        const isAnonymous = Boolean((newDoc as { isAnonymous?: boolean }).isAnonymous);
        if (!isAnonymous && (user.isAnonymous || user.email !== newDoc.email)) {
          await ctx.db.patch(user._id, { isAnonymous: false, email: newDoc.email });
        }
      },
      onDelete: async (ctx, doc) => {
        // The anonymous plugin deletes the temporary user after linking. Our own
        // `users` row was already re-pointed by linkAnonymous; only drop it if it is
        // an orphan with no game history.
        const user = await ctx.db
          .query("users")
          .withIndex("by_authId", (q) => q.eq("authId", doc._id))
          .unique();
        if (!user) return;
        const anyGame = await ctx.db
          .query("gamePlayers")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .first();
        if (!anyGame) await ctx.db.delete(user._id);
      },
    },
  },
});

export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi();

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth({
    baseURL: authBaseUrl,
    trustedOrigins: [siteUrl],
    database: authComponent.adapter(ctx),
    emailAndPassword: { enabled: false },
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ["discord", "microsoft-entra-id", "email-password"],
      },
    },
    socialProviders: process.env.DISCORD_CLIENT_ID
      ? {
          discord: {
            clientId: process.env.DISCORD_CLIENT_ID,
            clientSecret: process.env.DISCORD_CLIENT_SECRET ?? "",
          },
        }
      : {},
    plugins: [
      crossDomain({ siteUrl }),
      convex({ authConfig }),
      anonymous({
        generateName: async () => randomName(),
        onLinkAccount: async ({ anonymousUser, newUser }) => {
          if (!("runMutation" in ctx)) return;
          await ctx.runMutation(internal.users.linkAnonymous, {
            fromAuthId: anonymousUser.user.id,
            toAuthId: newUser.user.id,
          });
        },
      }),
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          await sendMagicLinkEmail(email, url);
        },
      }),
      genericOAuth({
        config: process.env.MICROSOFT_CLIENT_ID
          ? [
              microsoftEntraId({
                clientId: process.env.MICROSOFT_CLIENT_ID,
                clientSecret: process.env.MICROSOFT_CLIENT_SECRET ?? "",
                tenantId: process.env.MICROSOFT_TENANT_ID ?? "common",
              }),
            ]
          : [],
      }),
    ],
  });
