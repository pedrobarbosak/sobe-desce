# Sobe e Desce

Online, real-time multiplayer version of the Portuguese trick-taking game **Sobe e Desce**.

- **Backend**: [Convex](https://convex.dev) (server-authoritative, realtime subscriptions)
- **Auth**: Better Auth via `@convex-dev/better-auth` (anonymous by default; link Discord, Microsoft Entra ID or an email magic link)
- **Frontend**: Vite + React + TypeScript + TanStack Router + Tailwind v4 + Motion
- **Rules engine**: pure TypeScript in `src/engine`, shared by server validation and client card-greying
- **Variants**: *Classic* is the game as played at the table. *Party* flips a public twist every round:
  Desce, Golden suit, Last trick ×5, Safe round, No trump, Lightning, As dealt, Pass (1–2 cards, left/right/across),
  Swap hands, Guardian, Free-for-all, Wild rank, Carousel, Market, Dummy hand, One face up, Upside down,
  Teams, Secret nemesis, Mirror, Musical tricks, Robin Hood, Marked card, Fog, Blind lead, Vote for trump, Communism.
  A twist never repeats two rounds running.
  Everything party-specific lives in `src/engine/party`; every hand-moving twist is count-preserving because
  a round is always five cards and five tricks. Powerups (Peek, Curse, Shield) are built and tested there
  too but switched off behind `POWERUPS_ENABLED` until they earn their place.

## Run locally

```bash
npm install
npx convex dev          # first run: pick "Start without an account" for a local backend, or log in
npm run dev             # Vite on http://localhost:5173
```

`npx convex dev` writes `.env.local` with `VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL`.
Then set the auth secrets on the deployment:

```bash
npx convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
npx convex env set SITE_URL http://localhost:5173
# optional providers
npx convex env set DISCORD_CLIENT_ID ...      && npx convex env set DISCORD_CLIENT_SECRET ...
npx convex env set MICROSOFT_CLIENT_ID ...    && npx convex env set MICROSOFT_CLIENT_SECRET ...
npx convex env set MICROSOFT_TENANT_ID common
npx convex env set RESEND_API_KEY ...         # magic-link emails; without it the link is printed in the Convex logs
```

OAuth redirect URIs point at the Convex site URL: `https://<deployment>.convex.site/api/auth/callback/discord`
and `.../api/auth/oauth2/callback/microsoft-entra-id`.

## The Android app

The same code in a native shell (Capacitor), built from `android/`. See
[docs/ANDROID.md](docs/ANDROID.md) for building, signing, and the links that open the app.

```bash
npm run android          # debug APK, pointed at the deployment in .env.android
```

## Deploying

Self-hosted on a VPS: Convex backend, static frontend and a Cloudflare tunnel, all in
Docker. See [docs/DEPLOY.md](docs/DEPLOY.md). Local development stays on localhost and
needs none of this.

```bash
./scripts/bootstrap.sh && ./scripts/tunnel.sh && ./scripts/deploy.sh
```

## Tests

```bash
npm test                # engine rules + Convex game loop (convex-test)
npm run typecheck
```

## Known issues

Tables of six seats and up cannot reach the win condition: only five tricks exist per
round however many people are playing, so the blank penalty pushes the table's total score
up faster than tricks pull it down. Affects `mesaGrande`, `party` and `liga`. Diagnosis,
measurements and candidate fixes are in [docs/LARGE-TABLES.md](docs/LARGE-TABLES.md).

## Layout

```
src/engine/     pure rules: cards, legal plays (sobe), scoring, round reducer, bots
src/engine/party/  the party variant: twists, powerups, party scoring; classic never calls in
convex/         schema, auth, games/sessions/presence, game loop (actions, timers, bots), history
src/routes/     landing, new game, join, lobby, live table, standings, history, manual entry, account
```
