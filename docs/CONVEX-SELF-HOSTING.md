# Self-hosting Convex: open issues and how to stay out of trouble

As of 2026-09-30. Written after Sobe e Desce's backend outgrew its box; meant for any project
on a self-hosted Convex backend.

## TL;DR checklist

A self-hosted Convex backend on its default SQLite store needs RAM in proportion to its stored
history, so it fails suddenly once the database grows. Do these on every project, ideally
before launch:

- [ ] Run the backend on **Postgres** (or MySQL), not the built-in SQLite. SQLite reads are not paged upstream yet.
- [ ] Set `DOCUMENT_RETENTION_DELAY` (2–3 days) and `SCHEDULED_JOB_RETENTION` (1 day) from day one. Pick once; never lower it and raise it again.
- [ ] Cap the backend container's memory (`mem_limit` + `memswap_limit`), so a runaway restarts the backend instead of freezing the host.
- [ ] Pin the backend and dashboard images to a commit tag, never `:latest`.
- [ ] Give every health-check `curl` a timeout (`-m 3`), so a wedged backend fails the deploy instead of hanging it.
- [ ] Bound writes in app code: no self-rescheduling loop without an exit, no schedule-then-cancel per event, and nothing that keeps running when no person is watching.
- [ ] Add a cron that ends or deletes stale work (abandoned sessions, old lobbies).
- [ ] Nightly `npx convex export` backups, kept off the box, with a restore you have tried once.
- [ ] Watch two numbers: backend RSS and database size.

## What happened on Sobe e Desce

On 2026-09-30 the backend needed more than 12 GB of RAM just to start, after 20 days of play on
a 6 GB container. The deploy hung at the backend health check, `docker ps` froze, and even
`cat` took 20+ seconds because the container was swapping.

| Measure | Value |
| --- | --- |
| Days since the database was created | 20 |
| SQLite file (`db.sqlite3`) | 2.4 GB |
| Rows in the document log | at least 1.8 million (top 10 tables) |
| `_scheduled_jobs` revisions | 741k (plus 398k `_scheduled_job_args`) |
| Moves made by bots | about 90% (161k of 171k) |
| Backend RSS 50 s after start, no clients | 5.5 GB, climbing 2.4 GB per 10 s |
| Backend RSS after moving to Postgres, empty | 17 MB |

Three things combined:

1. **The SQLite store loads whole ranges into memory** before returning rows (see Open
   upstream issues). Startup and background workers scan history, so RAM tracked the
   database size.
2. **Retention kept 14 days of every revision.** The backend default is 14 days; the compose
   file had not set it.
3. **The app wrote far more than players did.** Tables where every person had left kept
   dealing and playing with bots forever. Every bot move also armed a turn timer and
   cancelled it a second later. With no cleanup job, none of it ever stopped.

No single one was fatal; together they grew the log faster than anything pruned it.

## Open upstream issues

The SQLite memory bug is the one that bites every growing project, and its fixes are still
unmerged. States checked on 2026-09-30 in
[get-convex/convex-backend](https://github.com/get-convex/convex-backend).

| Issue | State | What goes wrong | Store | What to do |
| --- | --- | --- | --- | --- |
| [#495 SQLite index_scan materializes the entire index range](https://github.com/get-convex/convex-backend/issues/495) | Open | Range reads ignore the size hint and have no `LIMIT`, so every row in the range is parsed into memory. RAM grows with the database until OOM. | SQLite | Use Postgres. |
| [#522 Fix index_scan and load_documents for SQLite](https://github.com/get-convex/convex-backend/pull/522) | Open PR | The fix for #495. Reported a 2.3 GB database going from over 6.8 GB of RAM to about 355 MB. | SQLite | Nothing to do until it merges; then upgrade. |
| [#551 Paginate and stream SQLite reads](https://github.com/get-convex/convex-backend/pull/551) | Open PR | Follow-up to #522 with a query shape SQLite can stream. | SQLite | Same as #522. |
| [#539 Avoid loading the document log in SQLite max_ts](https://github.com/get-convex/convex-backend/pull/539) | Open PR | Startup reads the entire document log to find its newest timestamp. | SQLite | Use Postgres. |
| [#358 Retention worker stuck after a DOCUMENT_RETENTION_DELAY change](https://github.com/get-convex/convex-backend/issues/358) | Open | Lowering the delay and raising it again leaves retention in an endless `out_of_retention` loop; the reporter's backend OOM-crashed every few hours with no users. | All | Set the delay once. If you must change it, only lower it. |
| [#393 Constrain the retention boundary by the deletion cursor](https://github.com/get-convex/convex-backend/pull/393) | Open PR | The fix for #358. | All | Upgrade once merged. |
| [#557 Stale table_summary_v2 checkpoint wedges the summary worker](https://github.com/get-convex/convex-backend/issues/557) | Open | If the table-summary checkpoint stops advancing and retention passes it, the worker fails every 10 s forever, across restarts. | Postgres (reported) | Alert on repeating `out_of_retention` errors in the logs. |
| [#101 Random unrecoverable OOM crash](https://github.com/get-convex/convex-backend/issues/101) | Open | OOM at night with little traffic; the volume also crashed a bigger VM. No cause found. Matches the SQLite pattern. | SQLite (default) | Postgres, memory cap, backups. |
| [#225 Recommended CPU and memory for self-hosting](https://github.com/get-convex/convex-backend/issues/225) | Open | No official sizing. Reports range from about 225 MB idle to 10 GB. | All | Size from your own `docker stats`; cap it. |
| [#235 Database taking 11 GB with few documents](https://github.com/get-convex/convex-backend/issues/235) | Closed | Old revisions under the 14-day default filled the disk. Upstream's compose file now sets 2 days. | All | Set `DOCUMENT_RETENTION_DELAY` yourself. |
| [#250 Only 10 scheduled actions run concurrently](https://github.com/get-convex/convex-backend/issues/250) | Closed | Scheduler throughput is a knob. | All | `SCHEDULED_JOB_EXECUTION_PARALLELISM` if jobs queue up. |

## Mitigations: infrastructure

Postgres removes the root cause; the rest limits the damage when something else goes wrong.
All of it fits in one `docker-compose.yml` (this repo's [docker-compose.yml](../docker-compose.yml)
is a working example).

**Postgres next to the backend.** Upstream tests Postgres 17 and MySQL 8
([postgres_or_mysql.md](https://github.com/get-convex/convex-backend/blob/main/self-hosted/advanced/postgres_or_mysql.md)).
Three details trip people up:

- `POSTGRES_URL` is the server URL **without** a database name.
- The backend connects to a database named after `INSTANCE_NAME` with `-` turned into `_`
  (`my-app` → `my_app`). It must exist before the backend starts.
- On a private compose network set `DO_NOT_REQUIRE_SSL=1`, and publish no Postgres port.

```yaml
services:
  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      - POSTGRES_USER=convex
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD:?}   # hex, so it needs no URL escaping
      - INSTANCE_NAME=${INSTANCE_NAME}
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./scripts/postgres-init.sh:/docker-entrypoint-initdb.d/convex.sh:ro
    healthcheck:
      test: pg_isready -U convex -d postgres

  backend:
    image: ghcr.io/get-convex/convex-backend:${CONVEX_REV:?}   # a commit tag, not :latest
    mem_limit: 3g
    memswap_limit: 3g            # same figure = no swap: killed and restarted, not thrashing
    depends_on:
      postgres: { condition: service_healthy }
    environment:
      - POSTGRES_URL=postgresql://convex:${POSTGRES_PASSWORD}@postgres:5432
      - DO_NOT_REQUIRE_SSL=1
      - DOCUMENT_RETENTION_DELAY=259200   # 3 days; set once
      - SCHEDULED_JOB_RETENTION=86400     # 1 day
```

The init script ([scripts/postgres-init.sh](../scripts/postgres-init.sh)) only needs one line:
`psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE \"$(echo "$INSTANCE_NAME" | tr - _)\""`.
It runs once, on an empty data directory.

**Memory ceiling.** Without one, a runaway backend drags the whole host into swap, and then
even SSH and `docker ps` stop answering. With `mem_limit` and an equal `memswap_limit`, Docker
kills just the backend and `restart: unless-stopped` brings it back.

**Pin the image.** ghcr tags are full commit SHAs. To pin what `latest` points to today, find
the tag with the same digest as `latest` and use that. Pin the dashboard to the same tag.
Upgrade on purpose, after a backup, and watch the log for `MigrationComplete`
([upgrading.md](https://github.com/get-convex/convex-backend/blob/main/self-hosted/advanced/upgrading.md)).

**Retention.** `DOCUMENT_RETENTION_DELAY` is how long every old revision is kept (14 days if
unset; upstream's compose sets 2). `SCHEDULED_JOB_RETENTION` keeps finished scheduled jobs
(7 days if unset). Set both before launch, and see #358 before ever changing the first.

**Health checks with timeouts.** A backend that accepts the connection and never answers holds
a bare `curl` forever. Use `curl -fsS -m 3` in deploy scripts, and print `free -m` and the last
log lines when it gives up.

## Mitigations: app code

In Convex every write keeps a full copy of the document for the retention window, and every
scheduled function adds rows of its own. So the database grows with what the code writes, not
with what users do. Review each project for these patterns:

| Pattern | Why it grows the database | Do instead |
| --- | --- | --- |
| Work that runs when nobody is watching (bots, simulations, polling loops) | It never stops on its own. On Sobe e Desce it was about 90% of all writes. | Stop scheduling when no person is present; resume on their next heartbeat or action; end it if nobody can come back. |
| Self-rescheduling loops (`runAfter` from inside the same function) | Each tick is a new `_scheduled_jobs` row plus an args row, forever unless something ends it. | Give every loop an exit condition, and slow it down when idle (30 s → 5 min). Prefer one cron over one loop per entity. |
| Schedule a timeout, then cancel it on every event | Each cycle writes a job, its args, and a cancel revision (about 3 rows) even when nothing times out. | Schedule it only where it can fire (not for bot turns), or keep one watchdog that reschedules itself to the current deadline. |
| Patching a large document on every event | Every patch stores the whole document again (2 KB × every move). | Keep the hot document small. Move fixed data to a document written once. Skip patches that change nothing. |
| Data that is never deleted (finished sessions, abandoned lobbies, presence rows) | Live rows pile up, and every query over them reads more. | An hourly or daily cron: end work idle for N hours, delete stale drafts after N days, delete in batches with `take()` and reschedule. |
| A query that reads a document patched every second | Every subscriber re-runs on every patch (CPU and bandwidth, not disk). | Split fast-changing fields (presence, heartbeats) into their own table and query. |

In this repo: `setTurn` in [convex/game/advance.ts](../convex/game/advance.ts) (no clock for
bots, stop when nobody is at the table) and [convex/maintenance.ts](../convex/maintenance.ts)
(the hourly cron).

Two guards worth adding to any project with background work:

- **A fallback for server-driven steps.** If a bot or job has no timer behind it, a rejected
  step stalls it forever. Catch the error and fall back to a safe default action.
- **Tests that fast-forward.** `convex-test` with `finishAllScheduledFunctions` fails on an
  endless schedule chain ("check for infinitely recursive scheduled functions"). A test that
  plays a whole game with nobody present is a cheap loop detector.

## Backups, restore and moving to Postgres

Use `npx convex export` for backups: it runs with the backend live, and the same zip restores
onto SQLite or Postgres.

```bash
export CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3210
export CONVEX_SELF_HOSTED_ADMIN_KEY='<admin key>'
npx convex export --include-file-storage --path backups/app-$(date +%Y%m%d-%H%M%S).zip
npx convex import --replace-all -y backups/<file>.zip    # restore: replaces every table
```

- An export holds current documents only, not history, so it is far smaller than the database.
- It does not hold deployment settings (`npx convex env`); keep those in your deploy script.
- Run it nightly from cron, keep the newest N, and copy them off the box. Cron has a bare
  `PATH`: a Node installed with nvm has to be loaded by the script (see `load_node` in
  [scripts/lib.sh](../scripts/lib.sh)).

**Moving an existing app from SQLite to Postgres**, while the old backend still runs:

1. Export from the running SQLite backend.
2. Deploy the compose file with Postgres. The backend comes up on an empty database; push the
   functions and settings.
3. Take the public tunnel or proxy down, import the export with `--replace-all`, and bring it
   back up.

The SQLite file stays in its volume untouched, so rolling back is redeploying the old compose
file. Make the deploy script refuse to run without the Postgres password, so nobody deploys
onto an empty Postgres by accident.
[scripts/migrate-to-postgres.sh](../scripts/migrate-to-postgres.sh) does all three steps.

**When the backend cannot start at all** (RAM runs out before it answers), an export is
impossible. Stop it, tar the data volume, and read the SQLite file directly:

- `documents(id, ts, table_id, json_value, deleted, prev_ts)` holds every revision;
  `json_value` includes `_id` and `_creationTime`.
- Table names and numbers are in the `_tables` documents (`name`, `number`, `namespace` for
  components).
- Take the newest non-deleted revision per `id`
  (`ROW_NUMBER() OVER (PARTITION BY id ORDER BY ts DESC)`).
- Write a snapshot zip: `<table>/documents.jsonl` plus `<table>/generated_schema.jsonl`
  containing `"uniform"`, `_tables/documents.jsonl` with `{"name":…,"id":<number>}`, and
  component tables under `_components/<name>/`. Import it with `--replace-all`; IDs are kept.

That is how Sobe e Desce kept its users when the database had to be reset.

## Monitoring and runbook

Two numbers warn weeks ahead: backend memory and database size. Check them weekly, or wire
them into whatever alerts you have.

```bash
docker stats --no-stream --format '{{.Name}} {{.MemUsage}}'
# Postgres
docker compose exec postgres psql -U convex -d <db> -c "select pg_size_pretty(pg_database_size('<db>'))"
# SQLite
docker run --rm -v <project>_data:/d:ro alpine ls -lh /d/db.sqlite3
```

Also watch the backend log for the same `out_of_retention` error repeating every few seconds;
that is #358 or #557, and it does not heal on its own.

**When the host is frozen and the deploy hangs at the backend step:**

1. Confirm it from outside the container (the Proxmox or cloud console). Memory and swap near
   100% with the backend on top is this failure.
2. Stop the backend: `docker stop <backend>`. The host recovers in seconds.
3. Tar the data volume before touching anything else.
4. Find what grew. On SQLite, count rows per scheduled function:

   ```sql
   SELECT json_extract(CAST(json_value AS TEXT), '$.udfPath') AS fn,
          json_extract(CAST(json_value AS TEXT), '$.state.type') AS state, COUNT(*)
   FROM documents WHERE table_id = (
     SELECT id FROM documents WHERE CAST(json_value AS TEXT) LIKE '%"name":"_scheduled_jobs","number"%' LIMIT 1)  -- the app's, not a component's
   GROUP BY fn, state ORDER BY 3 DESC LIMIT 15;
   ```

   Run it with `docker run --rm -i -v <volume>:/d:ro alpine sh -c 'apk add -q sqlite && sqlite3 /d/db.sqlite3'`,
   SQL on stdin; quoting it inline is fragile.
5. Get the data out: give the container more RAM for long enough to `npx convex export`, or
   extract straight from SQLite (see Backups).
6. Fix the cause before bringing it back: the code loop, the retention settings, Postgres.
   Then import, redeploy, and put the memory back.

Giving the box more RAM alone does not fix it: Sobe e Desce's backend filled 12 GB as readily
as 6.

## Reference: settings worth knowing

Every backend knob is an environment variable, defined in
[crates/common/src/knobs.rs](https://github.com/get-convex/convex-backend/blob/main/crates/common/src/knobs.rs)
(defaults as of 2026-09-30). The database and beacon settings are read by the Docker image's
start script, `self-hosted/docker-build/run_backend.sh`.

| Variable | Default | What it does | Suggested |
| --- | --- | --- | --- |
| `POSTGRES_URL` / `MYSQL_URL` | unset (SQLite) | Server URL without a database name | Set it |
| `DO_NOT_REQUIRE_SSL` | unset | Allow plain TCP to the database | `1` on a private network |
| `DOCUMENT_RETENTION_DELAY` | 1,209,600 s (14 days) | How long old revisions are kept | 172,800–259,200 s; set once |
| `SCHEDULED_JOB_RETENTION` | 604,800 s (7 days) | How long finished scheduled jobs are kept | 86,400 s |
| `INDEX_RETENTION_DELAY` | 240 s | How long old index entries are kept | Leave |
| `DOCUMENT_RETENTION_RATE_LIMIT` | 256 docs/s | Upper bound on retention deletes | Leave |
| `SCHEDULED_JOB_EXECUTION_PARALLELISM` | 8 | Scheduled functions run at once | Raise only if jobs queue |
| `APPLICATION_MAX_CONCURRENT_QUERIES` / `_MUTATIONS` | 16 | Concurrent function limits | Leave |
| `INDEX_CACHE_SIZE` | 512 MiB | Shared index cache | Lower on small boxes |
| `DISABLE_BEACON` | false | Usage beacon to Convex | `true` if you prefer |

## Sources

- [Self-hosting README](https://github.com/get-convex/convex-backend/tree/main/self-hosted),
  [Postgres or MySQL](https://github.com/get-convex/convex-backend/blob/main/self-hosted/advanced/postgres_or_mysql.md),
  [Upgrading](https://github.com/get-convex/convex-backend/blob/main/self-hosted/advanced/upgrading.md),
  [Knobs](https://github.com/get-convex/convex-backend/blob/main/self-hosted/advanced/knobs.md)
- Issues and PRs linked in the table above, states checked 2026-09-30
- This repository: [docker-compose.yml](../docker-compose.yml), [DEPLOY.md](DEPLOY.md),
  [scripts/migrate-to-postgres.sh](../scripts/migrate-to-postgres.sh),
  [convex/maintenance.ts](../convex/maintenance.ts)
