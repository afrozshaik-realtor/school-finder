#!/usr/bin/env bash
# Rebuilds a scratch PostgreSQL+PostGIS database, applies every migration
# and the DEMO seed, then runs the SQL integration tests in this directory.
#
# This emulates the auth/role primitives a real Supabase project provides
# (see 00_supabase_stubs.sql) so the actual migration files can be tested
# end-to-end without needing the full hosted/local Supabase stack. It is a
# genuine test of the SQL (RLS, functions, triggers) -- not a mock.
#
# Requires: a local `postgres` superuser-capable role, PostGIS installed.
# Usage: sudo bash tests/db/run.sh   (or run as a user that can `psql` and
#        `createdb`/`dropdb` against the target Postgres instance)

set -euo pipefail
cd "$(dirname "$0")/../.."

DB_NAME="${SCHOOLFINDER_TEST_DB:-schoolfinder_test}"
PSQL_USER="${SCHOOLFINDER_TEST_PGUSER:-postgres}"

run_as_pg() {
  if [ "$(id -u)" = "0" ] && id postgres >/dev/null 2>&1; then
    su postgres -c "$1"
  else
    eval "$1"
  fi
}

echo "== Rebuilding $DB_NAME =="
run_as_pg "dropdb --if-exists $DB_NAME"
run_as_pg "createdb $DB_NAME"

apply() {
  echo "== Applying $1 =="
  run_as_pg "psql -v ON_ERROR_STOP=1 -U $PSQL_USER -d $DB_NAME -f $(pwd)/$1"
}

apply tests/db/00_supabase_stubs.sql
for f in supabase/migrations/*.sql; do
  apply "$f"
done
apply supabase/seed.sql

echo "== Running integration tests =="
status=0
for f in tests/db/0[1-9]_*.sql; do
  echo "--- $f ---"
  if ! run_as_pg "psql -v ON_ERROR_STOP=1 -U $PSQL_USER -d $DB_NAME -f $(pwd)/$f"; then
    status=1
  fi
done

if [ "$status" -ne 0 ]; then
  echo "ONE OR MORE DB INTEGRATION TESTS FAILED" >&2
  exit 1
fi
echo "ALL DB INTEGRATION TESTS PASSED"
