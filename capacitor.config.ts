import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The native shell around the web build. The same `dist/` the site serves is bundled into
 * the app, so the only build-time difference is the VITE_* origins the bundle points at
 * (see docs/ANDROID.md).
 *
 * CAP_SERVER_URL swaps the bundled site for a running Vite dev server, for live reload on
 * a phone or emulator: `CAP_SERVER_URL=http://192.168.1.10:5173 npx cap run android`.
 */
const devServer = process.env.CAP_SERVER_URL;
// A workstation backend speaks plain http, which a page served over https may not talk
// to unless told so. Never true for a build pointed at a real deployment.
const insecureBackend = process.env.VITE_CONVEX_URL?.startsWith("http://") ?? false;

const config: CapacitorConfig = {
  appId: "com.sobedesce.app",
  appName: "Sobe e Desce",
  webDir: "dist",
  // The web view's own origin. Auth calls carry it as `Origin`, so the backend lists it
  // among the trusted origins (convex/auth.ts).
  server: devServer ? { url: devServer, cleartext: true } : { androidScheme: "https" },
  android: {
    allowMixedContent: insecureBackend,
  },
  plugins: {
    SplashScreen: {
      // The Android 12+ system splash (icon on the felt) is enough; no second splash.
      launchAutoHide: true,
      launchShowDuration: 0,
      backgroundColor: "#0f3d27",
    },
    SystemBars: {
      // The page draws edge to edge under `viewport-fit=cover` and keeps its own edges
      // clear with env(safe-area-inset-*) (see .safe-top in index.css). Light icons on
      // the dark felt.
      style: "DARK",
      insetsHandling: "css",
      initialViewportFitValueHint: "cover",
    },
  },
};

export default config;
