#!/usr/bin/env bash
set -euo pipefail
: "${RESTORE_DATABASE_URL:?Set RESTORE_DATABASE_URL to a NEW empty isolated database}"
: "${BACKUP_PATH:?Set BACKUP_PATH}"
: "${CONFIRM_EMPTY_RESTORE_TARGET:?Set CONFIRM_EMPTY_RESTORE_TARGET=YES after checking destination}"
if [ "$CONFIRM_EMPTY_RESTORE_TARGET" != YES ]; then exit 1; fi
for restore_tool in node psql pg_restore; do
  command -v "$restore_tool" >/dev/null || { printf 'Missing required restore tool: %s\n' "$restore_tool" >&2; exit 1; }
done
[ -f "$BACKUP_PATH" ] || { printf 'Backup archive is missing.\n' >&2; exit 1; }
# No --clean: never automatically drop an existing schema or production data.
restore_script_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
restore_target_state="$(node "$restore_script_directory/postgres-client.mjs" RESTORE_DATABASE_URL psql --no-password --no-psqlrc --tuples-only --no-align --set=ON_ERROR_STOP=1 --command="
SELECT CASE WHEN
  EXISTS (SELECT 1 FROM pg_namespace WHERE nspname NOT IN ('public', 'information_schema') AND nspname !~ '^pg_')
  OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_')
  OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_')
  OR EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_')
  OR EXISTS (SELECT 1 FROM pg_extension WHERE extname <> 'plpgsql')
THEN 'NOT_EMPTY' ELSE 'EMPTY' END;")"
if [ "$restore_target_state" != EMPTY ]; then
  printf 'Refusing restoration: the target database contains existing user objects. Use a new empty isolated database.\n' >&2
  exit 1
fi
node "$restore_script_directory/postgres-client.mjs" RESTORE_DATABASE_URL pg_restore --no-password --no-owner --no-acl --exit-on-error --single-transaction "$BACKUP_PATH"
printf 'Restore completed. Validate row counts, sample orders, and media before promotion.\n'
