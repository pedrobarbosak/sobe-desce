import { createAuthClient } from "better-auth/react";
import { anonymousClient, magicLinkClient, genericOAuthClient } from "better-auth/client/plugins";
import { convexClient, crossDomainClient } from "@convex-dev/better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_CONVEX_SITE_URL as string,
  plugins: [convexClient(), crossDomainClient(), anonymousClient(), magicLinkClient(), genericOAuthClient()],
});
