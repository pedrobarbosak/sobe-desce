#!/usr/bin/env bash
# Tail everything, or one service: ./scripts/logs.sh backend
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=scripts/lib.sh
. ./scripts/lib.sh
load_env
exec docker compose --env-file "$ENV_FILE" logs -f --tail=100 "$@"
