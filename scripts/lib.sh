#!/usr/bin/env bash
# Shared by every deployment script. Source it, do not execute it.

ENV_FILE=.env.deploy

require_env_file() {
  [ -f "$ENV_FILE" ] || {
    echo "no $ENV_FILE in $(pwd); run ./scripts/bootstrap.sh first" >&2
    exit 1
  }
}

load_env() {
  require_env_file
  set -a
  # shellcheck disable=SC1090
  . "./$ENV_FILE"
  set +a
}

# Compose only auto-loads a file literally named `.env`, and this project deliberately has
# none: Vite reads `.env` too, and the deployment's secrets have no business reaching a
# browser bundle. So every compose call names the file explicitly. Without this, each
# `${VAR:?}` in docker-compose.yml fails at parse time.
dc() { docker compose --env-file "$ENV_FILE" "$@"; }

# The file is read by two parsers with different rules: bash, when a script sources it,
# and Compose's dotenv, via `--env-file`. Single quotes are literal to both, which covers
# admin keys (pipe), base64 secrets (slash, plus) and hostnames. A value containing a
# single quote cannot be single-quoted, and bash's usual '\'' trick is a syntax error to
# Compose, so those fall back to double quotes, which both escape identically.
shellquote() {
  local v=$1
  if [[ $v != *"'"* ]]; then
    printf "'%s'" "$v"
    return
  fi
  v=${v//\\/\\\\}
  v=${v//\"/\\\"}
  v=${v//\$/\\\$}
  v=${v//\`/\\\`}
  printf '"%s"' "$v"
}

# Write KEY=value into .env.deploy. Appends when the key is absent rather than silently
# dropping the value, and never widens the file's permissions.
put_env() {
  local key=$1 value=$2 quoted
  quoted=$(shellquote "$value")
  if grep -q "^${key}=" "$ENV_FILE"; then
    awk -v k="$key" -v v="$quoted" -F= '$1==k{print k"="v; next}{print}' "$ENV_FILE" > "$ENV_FILE.tmp"
    mv "$ENV_FILE.tmp" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$quoted" >> "$ENV_FILE"
  fi
  chmod 600 "$ENV_FILE"
}

# True when the key has a non-empty value. `KEY=''` counts as empty, so an explicitly
# blanked secret is regenerated rather than treated as set.
env_is_set() {
  local current
  current=$(grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2-)
  current=${current#\'}
  current=${current%\'}
  [ -n "$current" ]
}
