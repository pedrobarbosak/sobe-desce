# Running Sobe e Desce on a VPS

Four containers: the Convex backend, the Postgres database it stores everything in, nginx
serving the built site, and a Cloudflare tunnel that puts the site and the backend on the
internet. Nothing binds to a public interface; the tunnel is the only way in, and it
terminates TLS at Cloudflare's edge.

A 2 vCPU / 4 GB / 40 GB box is comfortable. The backend is capped at `BACKEND_MEM_LIMIT`
(3 GB by default) and normally sits far below it.

**The deployment lives on the server, not on a workstation.** A development machine runs
`convex dev` and Vite on localhost and has no tunnel. Sharing hostnames between the two
means two connectors serving one name, which Cloudflare load-balances between them, so half
your requests hit the wrong database. Keep them apart.

## Prerequisites on the box

- Docker with the compose plugin.
- Node 24 and npm. The deploy bundles the Convex functions on the host, not in a container.
- `python3` and `cloudflared`.
- A domain on Cloudflare, and three hostnames one level under the apex. Universal SSL
  covers `*.example.com` but not `*.sub.example.com`, so `api.game.example.com` fails TLS.

## First run

```bash
git clone <repo> sobe-desce && cd sobe-desce
./scripts/bootstrap.sh          # writes .env.deploy and generates the permanent secrets
$EDITOR .env.deploy             # hostnames, and the Discord credentials if you want them
./scripts/tunnel.sh             # creates the tunnel, its DNS records and the ingress
./scripts/deploy.sh             # starts everything, mints the admin key, pushes, builds
```

`INSTANCE_SECRET`, `BETTER_AUTH_SECRET` and `POSTGRES_PASSWORD` are generated once and must
never change. Changing the first orphans the database; changing the second signs everyone
out; the third is baked into the Postgres volume the first time it starts.

**`.env.deploy` belongs to one machine.** Never copy it to another. The admin key is minted
against that host's container, `TUNNEL_USER` is that host's uid, and `INSTANCE_SECRET` must
keep matching that host's data volume. On a new box, run `bootstrap.sh` again.

## The three hostnames

| Variable | Serves | Goes to |
|---|---|---|
| `APP_HOST` | the game | `web:80` |
| `CONVEX_CLOUD_ORIGIN` | queries, mutations, the live websocket | `backend:3210` |
| `CONVEX_SITE_ORIGIN` | HTTP actions and all of auth | `backend:3211` |

`APP_HOST` is a bare hostname; the other two are full URLs. They must be the URLs a browser
uses. The backend advertises them and the client compares what it was given against what it
reaches, so a mismatch opens the connection and then fails auth confusingly.

They are also compiled into the frontend bundle, since Vite inlines `VITE_*` at build time.
Changing one means rebuilding the image, which `deploy.sh` does for you.

## Running compose by hand

This project has no `.env` file, deliberately: Vite would read it too, and the deployment's
secrets have no business in a browser bundle. Compose only auto-loads that one name, so
name the file explicitly:

```bash
docker compose --env-file .env.deploy ps
```

The scripts all do this for you. A bare `docker compose` will fail on missing variables.

## Deploying a change

```bash
git pull && ./scripts/deploy.sh
```

That is the whole process. Re-running is safe, and the script works out what actually
needs doing:

- Reinstalls dependencies only when `package-lock.json` moved.
- Pushes the schema, indexes and functions, and refreshes `convex/_generated`.
- Syncs the deployment's settings from `.env.deploy`, skipping the blank ones.
- Rebuilds the site image and replaces the web container. Docker caches the install layer,
  so an ordinary change rebuilds in seconds.
- Leaves the backend container alone unless its compose settings changed, so the database
  is not restarted and games in progress survive.
- Touches the tunnel only when `cloudflared/config.yml` is newer than the running
  container. Recreating it drops every live websocket for a few seconds.

Players reconnect automatically when the web container swaps, since the page holds its
websocket to the backend rather than to nginx.

**Before a schema change, take a backup.** Convex refuses a push that would leave existing
documents invalid, but a migration you meant to be safe is worth being able to undo.

```bash
./scripts/backup.sh && git pull && ./scripts/deploy.sh
```

Changing a hostname or the Discord credentials in `.env.deploy` needs no extra step: the
next deploy pushes the settings and rebuilds the bundle. Changing a hostname also means
re-running `./scripts/tunnel.sh` first, so the ingress and DNS follow.

## Ports

Everything publishes on `127.0.0.1` only. The defaults are 3210 and 3211 for the backend,
8080 for the site and 6791 for the dashboard. If something on the host already holds one,
set `BACKEND_PORT`, `SITE_PORT`, `WEB_PORT` or `DASHBOARD_PORT` in `.env.deploy` rather than
passing them on the command line, or the next deploy will recreate the container on the
default and fail to bind.

## Generated code is committed

`convex/_generated` is in the repository on purpose. The Convex CLI builds it from the
contents of `convex/`, and nothing typechecks without it. `deploy.sh` refreshes it as a side
effect of pushing, so commit the result if it changes.

`src/routeTree.gen.ts` is not committed. The Vite plugin writes it during the build, which
is why the build script runs Vite before the type check rather than after.

## Discord sign-in

Add this exact redirect to the Discord application, on the actions hostname rather than the
app one:

```
https://<CONVEX_SITE_ORIGIN host>/api/auth/callback/discord
```

Put the client id and secret in `.env.deploy` and deploy. Leaving them blank is fine: the
provider simply does not appear on the account page. The scopes `identify` and `email` are
requested at sign-in and need no configuration.

To use Discord on a development machine too, add a second redirect for
`http://127.0.0.1:3213/api/auth/callback/discord`. Discord accepts http on loopback.

## The dashboard

Off the tunnel on purpose. It is an unauthenticated admin console, and anyone who reaches it
owns the database. It points at the backend's local address, so it still works when the
tunnel is the thing that is broken.

```bash
docker compose --env-file .env.deploy --profile dashboard up -d dashboard
ssh -L 6791:127.0.0.1:6791 user@vps
```

## Backups

```bash
./scripts/backup.sh                          # backups/sobe-desce-<time>.zip
./scripts/restore.sh backups/<file>.zip      # replaces every table with the export
```

A backup is a `convex export` of every table and the stored files, taken through the running
backend with no downtime. It keeps the newest `BACKUP_KEEP` (14) and deletes older ones.
Deployment settings are not in it; `deploy.sh` sets those. Move copies off the box; a backup
on the same disk is not one.

Nightly, from `crontab -e`. The scripts load Node from nvm themselves when it is not on
`PATH`, which it never is under cron:

```
15 4 * * * cd /root/sobe-desce && ./scripts/backup.sh >> backups/backup.log 2>&1
```

## Keeping the database small

What happened once, so it does not again: in three weeks the backend's database reached
2.4 GB, and the backend then needed more than 6 GB of RAM just to start, so the box froze
and the deploy hung. Three things combined:

- **SQLite.** The backend's built-in SQLite store reads whole ranges of history into memory
  (get-convex/convex-backend#495, unfixed at the time), so its RAM grows with the database.
  Postgres pages those reads; that is why it is in the compose file.
- **History.** Convex keeps every old revision of every document for
  `DOCUMENT_RETENTION_DELAY` (14 days by default; 3 here) and finished scheduled jobs for
  `SCHEDULED_JOB_RETENTION` (7 days by default; 1 here). Pick the first once and leave it:
  lowering it and later raising it again can wedge retention (convex-backend#358).
- **Tables nobody was at.** About nine moves in ten were bots playing tables every person
  had left. Now a table with no one left in person stops (and waits, if a dropped tab can
  still come back), bots no longer get a turn clock, and an hourly cron
  (`convex/maintenance.ts`) ends sittings with no move in 12 hours and deletes one-off lobbies
  nobody dealt within a week.

Worth a glance now and then: `docker stats --no-stream` for the backend's memory, and the
database size:

```bash
docker compose --env-file .env.deploy exec postgres psql -U convex -d sobe_desce -c "select pg_size_pretty(pg_database_size('sobe_desce'))"
```

## Upgrading the backend

`CONVEX_REV` pins the backend and dashboard build (a commit tag from
`ghcr.io/get-convex/convex-backend`); the default lives in `docker-compose.yml`. Take a
backup, set the new tag in `.env.deploy` (or move the default), deploy, and watch the backend
log for `MigrationComplete`. The upstream notes are in `self-hosted/advanced/upgrading.md` of
get-convex/convex-backend.

## Moving an existing deployment from SQLite to Postgres

Deployments set up before Postgres was added keep their data in SQLite inside the `data`
volume. With the old backend still running:

```bash
git pull && ./scripts/migrate-to-postgres.sh
```

It exports everything from the SQLite backend, brings the stack up on an empty Postgres,
and imports the export with the tunnel down. The SQLite file is left where it was; once the
site is fine for a while it can go. A plain `deploy.sh` refuses to run without
`POSTGRES_PASSWORD`, so the move cannot happen by accident onto an empty database.

## Logs

```bash
./scripts/logs.sh            # everything
./scripts/logs.sh backend    # one service
```

## Deploying from a workstation

`.env.local` belongs to `npx convex dev` and cannot coexist with a self-hosted deploy. The
deploy script stops with an explanation if it finds one. Move it aside for the run:

```bash
mv .env.local .env.local.dev && ./scripts/deploy.sh; mv .env.local.dev .env.local
```

A server checkout never has this problem, since the file is gitignored.

## When the tunnel will not start

- **`couldn't read tunnel credentials … permission denied`**: the container runs as uid
  65532 and the credentials file is 0600 owned by you. `tunnel.sh` records `TUNNEL_USER` to
  pin the container to the owner. Re-run it, then deploy.
- **`Unauthorized: Tunnel not found`**: the tunnel named in `cloudflared/config.yml` was
  deleted at Cloudflare. Re-run `tunnel.sh`, which will create a new one.
- **`tunnel exists but its credentials are not on this machine`**: it was created on a
  different host. A tunnel's credentials are written only where it was created. Either copy
  that file across, or delete the tunnel and let `tunnel.sh` make a fresh one. The script
  refuses before touching DNS, so nothing is half-applied.
- **`Failed to dial a quic connection … sendmsg: network is unreachable`**, with an IPv6
  address in brackets: the container has no IPv6 route but cloudflared chose an IPv6 edge
  address. Compose pins `--edge-ip-version 4` for this reason; override it with
  `TUNNEL_EDGE_IP_VERSION` only on a host with working IPv6.
- **530 from Cloudflare**: DNS points at a tunnel with no connector attached. Check
  `cloudflared tunnel list` for a non-zero connection count, then the tunnel container's
  logs.
