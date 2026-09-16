import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { ConvexBetterAuthProvider, type AuthClient } from "@convex-dev/better-auth/react";
import "@fontsource-variable/fraunces/opsz.css";
import "@fontsource-variable/inter/opsz.css";
import "./index.css";
import "./i18n";
import { routeTree } from "./routeTree.gen";
import { convex } from "./lib/convex";
import { authClient, consumeOneTimeToken } from "./lib/auth-client";
import { installNativeShell } from "./lib/native";

const router = createRouter({ routeTree, defaultPreload: "intent", scrollRestoration: true });

// Inside the Android app: links that open the app, the back button, the status bar.
installNativeShell({
  navigate: (path) => router.history.push(path),
  canGoBack: () => router.history.canGoBack(),
  goBack: () => router.history.back(),
  consumeOneTimeToken,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConvexBetterAuthProvider client={convex} authClient={authClient as unknown as AuthClient}>
      <RouterProvider router={router} />
    </ConvexBetterAuthProvider>
  </React.StrictMode>,
);
