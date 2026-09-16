import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";

/** True inside the Android (one day iOS) shell; false in every browser, installed PWA included. */
export const isNative = Capacitor.isNativePlatform();

/**
 * The scheme the app answers to. A sign-in leaves for the system browser and comes back
 * on it, so the callback lands in the app rather than in a browser tab. Registered in
 * android/app/src/main/AndroidManifest.xml and trusted by convex/auth.ts.
 */
export const APP_SCHEME = "sobedesce";

/** Where a sign-in started inside the app returns to. */
export const NATIVE_AUTH_CALLBACK = `${APP_SCHEME}://account`;

/** A browser on an Android phone: the one place the app is worth offering. */
export const isAndroidBrowser = !isNative && typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);

/** Where the site serves the app from; scripts/android.sh puts a release build there. */
export const APK_PATH = "/app/sobe-desce.apk";

/** The APK to offer: the site's own copy, unless the build points at a release page. */
export function apkUrl(): string {
  return (import.meta.env.VITE_APK_URL as string | undefined) || APK_PATH;
}

/**
 * The site's public origin, for anything that leaves the device: an invite pasted into a
 * chat, or the address a web sign-in returns to. Inside the shell the page's own origin
 * is the web view's (https://localhost), which means nothing to anyone else, so the
 * VITE_APP_URL compiled into the bundle stands in for it.
 */
export function publicOrigin(): string {
  const configured = (import.meta.env.VITE_APP_URL as string | undefined)?.replace(/\/+$/, "");
  return isNative && configured ? configured : window.location.origin;
}

/**
 * The in-app path a link opens, or null for a link that is not ours. A site link keeps
 * its path; on the app's own scheme the host is the first segment, so
 * sobedesce://account and https://<site>/account are the same page. The one-time sign-in
 * token is not part of the page: it is consumed before navigating (consumeOneTimeToken).
 */
export function deepLinkPath(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== `${APP_SCHEME}:` && url.protocol !== "https:" && url.protocol !== "http:") return null;
  const path = url.protocol === `${APP_SCHEME}:` ? `/${url.host}${url.pathname}` : url.pathname;
  const clean = path.replace(/\/+$/, "") || "/";
  url.searchParams.delete("ott");
  const search = url.searchParams.toString();
  return search ? `${clean}?${search}` : clean;
}

/** The one-time token a sign-in callback carries, if any. */
export function oneTimeTokenIn(raw: string): string | null {
  try {
    return new URL(raw).searchParams.get("ott");
  } catch {
    return null;
  }
}

/** Opens a page outside the app: the system browser on a phone, a new tab on the web. */
export async function openExternal(url: string): Promise<void> {
  if (isNative) await Browser.open({ url });
  else window.open(url, "_blank", "noopener");
}

type BackHandler = () => boolean;
const backHandlers: BackHandler[] = [];

/**
 * Claims the Android back button while something sits over the page: a drawer, a result
 * card. The handler returns true when it consumed the press. Returns the release.
 * Handlers stack, so the most recently opened thing closes first. A no-op on the web,
 * where the browser owns the button.
 */
export function onHardwareBack(handler: BackHandler): () => void {
  backHandlers.push(handler);
  return () => {
    const i = backHandlers.lastIndexOf(handler);
    if (i >= 0) backHandlers.splice(i, 1);
  };
}

type ShellHooks = {
  /** Go to an in-app path. */
  navigate: (path: string) => void;
  /** Whether the page has somewhere to go back to, and going there. The web view's own
   * idea of history does not count in-page navigation, so the router answers. */
  canGoBack: () => boolean;
  goBack: () => void;
  /** Finish a sign-in that came back through a link. */
  consumeOneTimeToken: (token: string) => Promise<void>;
};

/**
 * Wires the shell to the page: links that open the app, and the back button.
 * Called once at startup; does nothing in a browser.
 */
export function installNativeShell({ navigate, canGoBack, goBack, consumeOneTimeToken }: ShellHooks): void {
  if (!isNative) return;

  // A cold start from a link reports it both as the launch URL and as an open event, so
  // the same link twice in quick succession is one link. Later on it is a new tap.
  let last: { url: string; at: number } | null = null;
  const open = async (raw: string) => {
    const now = Date.now();
    if (last && last.url === raw && now - last.at < 2000) return;
    last = { url: raw, at: now };
    const token = oneTimeTokenIn(raw);
    if (token) {
      try {
        await consumeOneTimeToken(token);
      } catch (err) {
        console.error("sign-in link failed", err);
      }
    }
    const path = deepLinkPath(raw);
    if (path) navigate(path);
  };
  void App.getLaunchUrl().then((launch) => {
    if (launch?.url) void open(launch.url);
  });
  void App.addListener("appUrlOpen", (event) => void open(event.url));

  void App.addListener("backButton", () => {
    for (let i = backHandlers.length - 1; i >= 0; i--) if (backHandlers[i]!()) return;
    // At the root there is nothing to go back to; the app steps aside rather than dying,
    // so the game's live connection is still warm when it comes back.
    if (canGoBack()) goBack();
    else void App.minimizeApp();
  });
}
