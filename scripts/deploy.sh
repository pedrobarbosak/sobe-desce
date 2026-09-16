#!/usr/bin/env bash
# Push the Convex functions, sync the deployment's settings, rebuild the site, and bring
# everything up. Run it after every change. Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=scripts/lib.sh
. ./scripts/lib.sh
load_env

: "${CONVEX_CLOUD_ORIGIN:?}" "${CONVEX_SITE_ORIGIN:?}" "${APP_HOST:?}"
# Not optional, unlike the sign-in providers below: without it nobody can log in, and an
# empty value would sail past the "skip if empty" path further down.
: "${BETTER_AUTH_SECRET:?run ./scripts/bootstrap.sh to generate it}"

export CONVEX_SELF_HOSTED_URL="${CONVEX_ADMIN_URL:-http://127.0.0.1:${BACKEND_PORT:-3210}}"
unset CONVEX_DEPLOYMENT CONVEX_DEPLOY_KEY

# The CLI reads .env.local by itself and refuses to combine it with a self-hosted deploy.
# That file belongs to `convex dev` on a workstation and has no business on a server.
if [ -f .env.local ] && grep -q '^CONVEX_DEPLOYMENT=' .env.local; then
  cat >&2 <<'MSG'
.env.local sets CONVEX_DEPLOYMENT, which cannot be combined with a self-hosted deploy.
That file is for local `convex dev` only and is gitignored, so a server checkout will not
have it. Move it aside before deploying from a workstation:
  mv .env.local .env.local.dev
MSG
  exit 1
fi

# The CLI bundles the functions, so the dependencies have to be here. Reinstall when the
# lockfile is newer than the tree, or a dependency bump would deploy with a stale CLI.
if [ ! -x node_modules/.bin/convex ] || [ package-lock.json -nt node_modules/.bin/convex ]; then
  command -v npm >/dev/null || { echo "npm is required on this host; install Node 24" >&2; exit 1; }
  echo "==> dependencies"
  npm ci
fi
CONVEX=node_modules/.bin/convex

echo "==> backend"
dc up -d backend
for i in $(seq 1 60); do
  curl -fsS "$CONVEX_SELF_HOSTED_URL/version" >/dev/null 2>&1 && break
  if [ "$i" = 60 ]; then
    echo "backend did not answer on $CONVEX_SELF_HOSTED_URL" >&2
    dc logs --tail=30 backend >&2
    exit 1
  fi
  sleep 1
done

# First run on a machine has no key yet. Minting it needs the backend, so it happens here
# rather than in bootstrap.
if [ -z "${CONVEX_SELF_HOSTED_ADMIN_KEY:-}" ]; then
  echo "==> admin key"
  ./scripts/admin-key.sh
  load_env
fi
export CONVEX_SELF_HOSTED_ADMIN_KEY

echo "==> deployment settings"
# Only push a variable that is actually set: an empty Discord id would register a broken
# provider, and convex/auth.ts gates each one on the presence of its id.
set_env() {
  local key=$1 value=${2:-}
  if [ -z "$value" ]; then
    echo "  $key skipped (empty)"
    return
  fi
  # Read from /dev/null so the CLI can never sit waiting on a prompt, and keep its output
  # out of the log: an error message can quote the value being set.
  if "$CONVEX" env set "$key" "$value" >/dev/null 2>/tmp/convex-env-err </dev/null; then
    echo "  $key set"
  else
    echo "  $key FAILED; the CLI said:" >&2
    sed -E "s/${value//\//\\/}/<value>/g" /tmp/convex-env-err >&2 || cat /tmp/convex-env-err >&2
    rm -f /tmp/convex-env-err
    exit 1
  fi
  rm -f /tmp/convex-env-err
}
set_env SITE_URL "https://$(echo "${APP_HOST#http://}" | sed 's|^https://||' | cut -d/ -f1)"
set_env AUTH_BASE_URL "$CONVEX_SITE_ORIGIN"
set_env BETTER_AUTH_SECRET "$BETTER_AUTH_SECRET"
set_env DISCORD_CLIENT_ID "${DISCORD_CLIENT_ID:-}"
set_env DISCORD_CLIENT_SECRET "${DISCORD_CLIENT_SECRET:-}"
set_env MICROSOFT_CLIENT_ID "${MICROSOFT_CLIENT_ID:-}"
set_env MICROSOFT_CLIENT_SECRET "${MICROSOFT_CLIENT_SECRET:-}"
set_env MICROSOFT_TENANT_ID "${MICROSOFT_TENANT_ID:-}"
set_env RESEND_API_KEY "${RESEND_API_KEY:-}"
set_env EMAIL_FROM "${EMAIL_FROM:-}"

echo "==> functions, schema and indexes"
"$CONVEX" deploy -y </dev/null

# Android opens links to the site in the app only if the site vouches for the app's
# signing certificate. The file is generated here so the fingerprint lives in .env.deploy
# with the other deployment facts, and removed again if it is unset.
mkdir -p public/.well-known
if [ -n "${ANDROID_CERT_SHA256:-}" ]; then
  cat > public/.well-known/assetlinks.json <<JSON
[{"relation": ["delegate_permission/common.handle_all_urls"],
  "target": {"namespace": "android_app", "package_name": "com.sobedesce.app",
             "sha256_cert_fingerprints": ["$ANDROID_CERT_SHA256"]}}]
JSON
  echo "  assetlinks.json written for the Android app"
else
  rm -f public/.well-known/assetlinks.json
fi

echo "==> site"
# The hostnames are compiled into the bundle, so this is a real rebuild whenever they
# change. Docker caches the install layer, so it is quick when they do not.
dc build web
dc up -d web

# cloudflared does not reload its ingress, and `up -d` is a no-op when the container spec is
# unchanged, so a re-run of tunnel.sh would otherwise never take effect. Recreating it drops
# every live websocket for a few seconds, so only do it when the ingress actually changed.
if [ -f cloudflared/config.yml ]; then
  started=$(docker inspect -f '{{.State.StartedAt}}' sobe-desce-tunnel 2>/dev/null || true)
  started_at=$([ -n "$started" ] && date -d "$started" +%s 2>/dev/null || echo 0)
  if [ "$started_at" -lt "$(stat -c %Y cloudflared/config.yml)" ]; then
    echo "  ingress changed since the tunnel started; recreating it"
    dc up -d --force-recreate tunnel
  else
    dc up -d tunnel
  fi
else
  echo "  no cloudflared/config.yml yet; run ./scripts/tunnel.sh to create the tunnel"
fi

echo
echo "Live at https://${APP_HOST#http*://}"
dc ps
