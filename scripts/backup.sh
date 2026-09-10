#!/usr/bin/env bash
# Snapshot the whole deployment: the database and the stored files live in one volume.
# Writes a timestamped tarball into ./backups. Keep these off the box.
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=scripts/lib.sh
. ./scripts/lib.sh
load_env

mkdir -p backups
STAMP=$(date +%Y%m%d-%H%M%S)
NAME="sobe-desce-$STAMP.tar.gz"

VOLUME=$(dc config --format json | python3 -c 'import sys,json;print(json.load(sys.stdin)["volumes"]["data"]["name"])')
[ -n "$VOLUME" ] || { echo "could not resolve the data volume name" >&2; exit 1; }

# Stopping the backend means the SQLite file is copied whole rather than mid-write. The
# trap is the point of it: without one, a failed tar leaves the site down.
restart() { dc start backend >/dev/null 2>&1 || true; }
trap restart EXIT

echo "stopping the backend for a consistent copy"
dc stop backend

docker run --rm \
  -v "$VOLUME":/data:ro \
  -v "$PWD/backups":/out \
  --user "$(id -u):$(id -g)" \
  alpine tar czf "/out/$NAME" -C /data .

trap - EXIT
restart

echo "wrote backups/$NAME"
ls -lh "backups/$NAME"
