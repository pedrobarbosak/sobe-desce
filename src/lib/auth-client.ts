import { createAuthClient } from "better-auth/react";
import { anonymousClient, magicLinkClient, genericOAuthClient } from "better-auth/client/plugins";
import { convexClient, crossDomainClient } from "@convex-dev/better-auth/client/plugins";
import { NATIVE_AUTH_CALLBACK, isNative, openExternal, publicOrigin } from "./native";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_CONVEX_SITE_URL as string,
  plugins: [convexClient(), crossDomainClient(), anonymousClient(), magicLinkClient(), genericOAuthClient()],
});

/**
 * The cross-domain plugin's one-time-token exchange is not on the client's public type,
 * so the provider casts to reach it and so do we.
 */
type CrossDomainActions = {
  crossDomain: {
    oneTimeToken: { verify: (body: { token: string }) => Promise<{ data?: { session?: { token: string } } | null }> };
    updateSession: () => void;
  };
};

/**
 * Where a sign-in returns to once the provider (or the magic link) has done its part.
 * On the web that is the account page on the site. In the app it is the app's own
 * scheme, so the callback opens the app instead of a browser tab; installNativeShell
 * then finishes the sign-in with consumeOneTimeToken.
 */
export function signInCallback(): string {
  return isNative ? NATIVE_AUTH_CALLBACK : `${publicOrigin()}/account`;
}

/**
 * Starts a Discord or Microsoft sign-in. In a browser the page itself goes to the
 * provider. In the app the provider opens in the system browser: a web view is not a
 * place to type a password into, and the providers say as much.
 */
export async function signInWithProvider(provider: "discord" | "microsoft"): Promise<void> {
  const callbackURL = signInCallback();
  const start = (disableRedirect: boolean) =>
    provider === "discord"
      ? authClient.signIn.social({ provider: "discord", callbackURL, disableRedirect })
      : authClient.signIn.oauth2({ providerId: "microsoft-entra-id", callbackURL, disableRedirect });
  if (!isNative) {
    await start(false);
    return;
  }
  const { data } = await start(true);
  if (data?.url) await openExternal(data.url);
}

/**
 * Finishes a sign-in that came back through a link while the app was already open:
 * trades the one-time token for the session, exactly as the provider does for `?ott=`
 * in the page address on load. Resolves once the session is in place and announced.
 */
export async function consumeOneTimeToken(token: string): Promise<void> {
  const crossDomain = (authClient as unknown as CrossDomainActions).crossDomain;
  const result = await crossDomain.oneTimeToken.verify({ token });
  const session = result.data?.session;
  if (!session) throw new Error("sign-in link expired");
  await authClient.getSession({ fetchOptions: { headers: { Authorization: `Bearer ${session.token}` } } });
  crossDomain.updateSession();
}
