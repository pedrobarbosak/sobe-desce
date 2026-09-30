#!/usr/bin/env bash
# One-off: move a deployment from the backend's built-in SQLite store to the Postgres
# service in docker-compose.yml. Run it once, after pulling the compose file that added
# Postgres, while the old backend is still up:
#
#   1. exports everything from the running SQLite backend (backup.sh);
#   2. brings the stack up on Postgres, which starts empty (deploy.sh);
#   3. imports the export into it, with the tunnel down so nobody plays in between.
#
# The SQLite file stays where it was in the data volume, untouched. Going back is checking
# out the previous docker-compose.yml and deploying.
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=scripts/lib.sh
. ./scripts/lib.sh
load_env

if docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' sobe-desce-convex 2>/dev/null | grep -q '^POSTGRES_URL='; then
  echo "the backend is already running on Postgres; nothing to migrate" >&2
  exit 1
fi
url="${CONVEX_ADMIN_URL:-http://127.0.0.1:${BACKEND_PORT:-3210}}"
curl -fsS -m 3 "$url/version" >/dev/null 2>&1 || {
  echo "the old backend is not answering on $url; start it first, the data comes out of it" >&2
  exit 1
}

if ! env_is_set POSTGRES_PASSWORD; then
  put_env POSTGRES_PASSWORD "$(openssl rand -hex 24)"
  echo "  POSTGRES_PASSWORD generated"
fi
# Older copies of .env.deploy.example set this, which would override the pinned build.
if [ "${CONVEX_REV:-}" = latest ]; then
  put_env CONVEX_REV ''
  echo "  CONVEX_REV cleared, so the build pinned in docker-compose.yml is used"
fi

echo "==> export from SQLite"
./scripts/backup.sh
export_zip=$(ls -1t backups/sobe-desce-*.zip | head -1)

echo "==> stack on Postgres"
./scripts/deploy.sh
dc stop tunnel

echo "==> import $export_zip"
restart_tunnel() { dc start tunnel >/dev/null 2>&1 || true; }
trap restart_tunnel EXIT
./scripts/restore.sh "$export_zip"

echo
echo "Done. The backend is on Postgres; the old SQLite file is still in the data volume."
