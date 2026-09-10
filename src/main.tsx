import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { ConvexBetterAuthProvider, type AuthClient } from "@convex-dev/better-auth/react";
import "./index.css";
import "./i18n";
import { routeTree } from "./routeTree.gen";
import { convex } from "./lib/convex";
import { authClient } from "./lib/auth-client";

const router = createRouter({ routeTree, defaultPreload: "intent", scrollRestoration: true });

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
