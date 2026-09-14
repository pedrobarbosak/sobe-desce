import { type Plugin, defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { fileURLToPath } from "node:url";

/**
 * Chat clients will not resolve a relative `og:image` against the page, so the social tags
 * in index.html need absolute URLs to unfurl. The public hostname belongs to the
 * deployment rather than to the source, so it arrives as VITE_APP_URL at build time the
 * same way the Convex origins do. Left unset (local development), the tags stay relative
 * rather than turning into a broken absolute URL.
 */
function absoluteSocialUrls(): Plugin {
  return {
    name: "absolute-social-urls",
    transformIndexHtml(html) {
      const base = process.env.VITE_APP_URL?.replace(/\/+$/, "");
      if (!base) return html;
      return html.replace(
        /(<meta\s+property="og:(?:image|url)"\s+content=")(\/[^"]*)(")/g,
        (_m, before: string, path: string, after: string) => `${before}${base}${path}${after}`,
      );
    },
  };
}

/** The dev server's twin of nginx's `$uri.html`: /cards opens the card sheet, not the app. */
function standalonePages(): Plugin {
  return {
    name: "standalone-pages",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === "/cards" || req.url?.startsWith("/cards?")) req.url = req.url.replace("/cards", "/cards.html");
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    absoluteSocialUrls(),
    standalonePages(),
  ],
  server: {
    // Local development only. The public hostnames belong to the VPS deployment, which
    // serves a built bundle through nginx and never touches this dev server.
    host: true,
  },
  build: {
    // The card sheet is its own page, so it builds without the app's router or backend.
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        cards: fileURLToPath(new URL("./cards.html", import.meta.url)),
      },
    },
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
