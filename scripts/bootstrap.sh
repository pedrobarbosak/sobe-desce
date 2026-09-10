#!/usr/bin/env bash
# First run on a machine: create .env.deploy and generate the secrets that must never
# change afterwards. Safe to re-run; it never overwrites a value that is already set.
#
# .env.deploy is per machine. Never copy it between hosts: the admin key and the tunnel
# user belong to one box, and INSTANCE_SECRET must keep matching that box's data volume.
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=scripts/lib.sh
. ./scripts/lib.sh

if [ ! -f "$ENV_FILE" ]; then
  cp .env.deploy.example "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "created $ENV_FILE"
fi

generate() {
  local key=$1 value=$2
  if env_is_set "$key"; then
    echo "  $key already set, leaving it"
  else
    put_env "$key" "$value"
    echo "  $key generated"
  fi
}

echo "Generating secrets:"
generate INSTANCE_SECRET "$(openssl rand -hex 32)"
generate BETTER_AUTH_SECRET "$(openssl rand -base64 32)"

cat <<'EOF'

Next:
  1. Edit .env.deploy: APP_HOST, CONVEX_CLOUD_ORIGIN, CONVEX_SITE_ORIGIN, and the
     Discord credentials if you want that sign-in.
  2. ./scripts/tunnel.sh          creates the tunnel, its DNS records and the ingress
  3. ./scripts/deploy.sh          starts the backend, pushes the functions, builds the site

The admin key is minted for you by deploy.sh on its first run.
EOF
