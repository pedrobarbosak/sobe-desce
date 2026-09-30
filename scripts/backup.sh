#!/usr/bin/env bash
# Export the whole deployment, every table and the stored files, through the running
# backend: no downtime, and the same format whatever the backend stores its data in.
# Writes a timestamped zip into ./backups and keeps the newest BACKUP_KEEP (default 14).
# Keep copies off the box. Restore (replaces every table) with:
#   ./scripts/restore.sh backups/<file>.zip
# Quiet enough to run from cron; docs/DEPLOY.md has the line.
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=scripts/lib.sh
. ./scripts/lib.sh
load_env
convex_cli_env

mkdir -p backups
NAME="sobe-desce-$(date +%Y%m%d-%H%M%S).zip"
"$CONVEX" export --include-file-storage --path "backups/$NAME" </dev/null
ls -lh "backups/$NAME"

keep=${BACKUP_KEEP:-14}
# Newest first; everything past the first $keep goes.
ls -1t backups/sobe-desce-*.zip | tail -n +$((keep + 1)) | xargs -r rm -f --
