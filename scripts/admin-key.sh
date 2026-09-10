#!/usr/bin/env bash
# Mint an admin key from the running backend and store it in .env.deploy. deploy.sh calls
# this itself when the key is missing; run it by hand only to rotate the key.
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=scripts/lib.sh
. ./scripts/lib.sh
load_env

# `docker compose ps` exits 0 with empty output when nothing matches, so test the output.
if [ -z "$(dc ps --status running --quiet backend 2>/dev/null)" ]; then
  echo "backend is not running; start it with: ./scripts/deploy.sh" >&2
  exit 1
fi

# The image prints a banner as well as the key. Take the line that looks like one:
# "<instance>|<hex>". Never fail silently on a format change.
KEY=$(dc exec -T backend ./generate_admin_key.sh 2>/dev/null | tr -d '\r' | grep -E '^[A-Za-z0-9_-]+\|[A-Za-z0-9]+$' | tail -1 || true)
if [ -z "$KEY" ]; then
  echo "could not parse an admin key from the backend's output" >&2
  echo "run this to see it: docker compose --env-file .env.deploy exec backend ./generate_admin_key.sh" >&2
  exit 1
fi

put_env CONVEX_SELF_HOSTED_ADMIN_KEY "$KEY"
echo "CONVEX_SELF_HOSTED_ADMIN_KEY written to $ENV_FILE"
