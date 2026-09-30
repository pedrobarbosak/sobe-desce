#!/usr/bin/env bash
# Load an export made by backup.sh into the running backend. Every table is replaced by
# the export's contents, including tables the export does not have (they end up empty).
# Deployment settings (`convex env`) are not part of an export; deploy.sh sets those.
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=scripts/lib.sh
. ./scripts/lib.sh
load_env
convex_cli_env

[ $# -eq 1 ] && [ -f "$1" ] || { echo "usage: $0 backups/<file>.zip" >&2; exit 1; }
"$CONVEX" import --replace-all -y "$1" </dev/null
