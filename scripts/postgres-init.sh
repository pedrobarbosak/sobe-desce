#!/bin/sh
# Run by the postgres image on first start, with an empty data directory only. The Convex
# backend connects to a database named after its instance, with - turned into _
# (self-hosted/advanced/postgres_or_mysql.md in get-convex/convex-backend).
set -eu
db=$(printf '%s' "${INSTANCE_NAME:-sobe-desce}" | tr '-' '_')
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres -c "CREATE DATABASE \"$db\""
