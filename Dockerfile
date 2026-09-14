# The frontend is static. Vite inlines VITE_* at build time, so the deployment's public
# hostnames are baked in here rather than read at runtime.
FROM node:24-alpine AS build
WORKDIR /app

ARG VITE_CONVEX_URL
ARG VITE_CONVEX_SITE_URL
# The site's own origin. Link previews need absolute image URLs, and index.html only gets
# them when this is set (see absoluteSocialUrls in vite.config.ts).
ARG VITE_APP_URL
ENV VITE_CONVEX_URL=$VITE_CONVEX_URL
ENV VITE_CONVEX_SITE_URL=$VITE_CONVEX_SITE_URL
ENV VITE_APP_URL=$VITE_APP_URL
# A bare `docker build` with no build args would otherwise produce a bundle that points at
# `undefined` and still serve happily. Compose always passes them; people do not.
RUN test -n "$VITE_CONVEX_URL" -a -n "$VITE_CONVEX_SITE_URL" || { \
      echo "VITE_CONVEX_URL and VITE_CONVEX_SITE_URL are required build args." >&2; \
      echo "Build through ./scripts/deploy.sh rather than calling docker build directly." >&2; \
      exit 1; }

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# convex/_generated is committed, so it arrives with the source. The route tree is not:
# the Vite plugin writes it during the build, which is why the build script runs Vite
# before the type check rather than after.
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost/ >/dev/null || exit 1
