#!/usr/bin/env bash
set -euo pipefail
# Use a PostgreSQL client matching the server major version. Credentials stay in the environment.
: "${DATABASE_URL:?Set DATABASE_URL securely}"
: "${BACKUP_PATH:?Set an encrypted durable backup destination path}"
umask 077
for backup_tool in node pg_dump pg_restore; do
  command -v "$backup_tool" >/dev/null || { printf 'Missing required backup tool: %s\n' "$backup_tool" >&2; exit 1; }
done
if [ -e "$BACKUP_PATH" ] || [ -L "$BACKUP_PATH" ]; then
  printf 'Refusing to overwrite an existing backup. Choose a new backup path.\n' >&2
  exit 1
fi
backup_script_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
backup_temp_path="$(mktemp "${BACKUP_PATH}.partial.XXXXXX")"
trap 'rm -f -- "$backup_temp_path"' EXIT
node "$backup_script_directory/postgres-client.mjs" DATABASE_URL pg_dump --no-password --format=custom --no-owner --no-acl --file="$backup_temp_path"
pg_restore --list "$backup_temp_path" > /dev/null
# An atomic hard link publishes a complete archive and never replaces an older backup.
ln -- "$backup_temp_path" "$BACKUP_PATH"
printf 'Backup completed and archive listing validated. Restore drill remains required.\n'
