#!/usr/bin/env bash
# Prepares a *plain local Postgres* database for the data-isolation tests.
# Not needed if you point TEST_DATABASE_URL at your dev Supabase project.
# Usage: TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/cp_test npm run db:test:setup
set -euo pipefail
: "${TEST_DATABASE_URL:?Set TEST_DATABASE_URL first}"

admin_url="${TEST_DATABASE_URL%/*}/postgres"
db_name="${TEST_DATABASE_URL##*/}"

psql "$admin_url" -q -c "drop database if exists \"$db_name\"" -c "create database \"$db_name\""
psql "$TEST_DATABASE_URL" -q -v ON_ERROR_STOP=1 -f tests/db/plain-postgres-shim.sql
for f in supabase/migrations/*.sql; do
  psql "$TEST_DATABASE_URL" -q -v ON_ERROR_STOP=1 -f "$f"
done
echo "Test database ready."
