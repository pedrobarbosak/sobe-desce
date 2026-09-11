# Running Sobe e Desce on a VPS

Three containers: the Convex backend, nginx serving the built site, and a Cloudflare tunnel
that puts both on the internet. Nothing binds to a public interface; the tunnel is the only
way in, and it terminates TLS at Cloudflare's edge.

A 2 vCPU / 4 GB / 40 GB box is comfortable. The backend is the only hungry process.

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

`INSTANCE_SECRET` and `BETTER_AUTH_SECRET` are generated once and must never change.
Changing the first orphans the database; changing the second signs everyone out.

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

The database and stored files live in one Docker volume.

```bash
./scripts/backup.sh
```

It stops the backend for a few seconds so the SQLite file is copied whole, and restarts it
even if the copy fails. Move the tarball off the box; a backup on the same disk is not one.

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
- **530 from Cloudflare**: DNS points at a tunnel with no connector attached. Check
  `cloudflared tunnel list` for a non-zero connection count, then the tunnel container's
  logs.
