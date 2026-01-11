#!/bin/bash

# =============================================================================
# PostgreSQL Database Restore Script (from pg_dump custom format)
# =============================================================================
# This script restores a database dump created with:
#   pg_dump ... --format=custom --no-owner --no-privileges --file="$BACKUP_FILENAME" ...
#
# It drops the target database if it exists, recreates it, and restores the dump.
#
# Usage:
#   1. Set the variables below or export them as environment variables.
#   2. Run: ./restore_postgres.sh
#
# Example environment variables:
#   export DATABASE_URL="postgresql://mik_app_test:test_pwd@127.0.0.1:5432/mik_ng"
#   export BACKUP_FILENAME="mik_ng_backup.dump"   # Your custom format dump file
#
# =============================================================================

# ---- Configurable variables (edit here or set as env vars) ----
: "${DATABASE_URL:=postgresql://admin:password@127.0.0.1:5432/mik_ng_restored}"                     # Full connection URL (required)
: "${BACKUP_FILENAME:=backup-2025-12-27-230024.dump}"                  # Path to the .dump file (custom format)

# ---- Helper: print usage ----
usage() {
    echo "Usage: $0"
    echo ""
    echo "Restores a PostgreSQL database from a custom-format pg_dump file."
    echo ""
    echo "Required variables (set as env vars or edit script):"
    echo "  DATABASE_URL     - e.g. postgresql://user:password@host:port/dbname"
    echo "  BACKUP_FILENAME  - Path to the backup file (e.g. db.dump)"
    echo ""
    echo "Example:"
    echo "  export DATABASE_URL=\"postgresql://mik_app_test:test_pwd@127.0.0.1:5432/mik_ng\""
    echo "  export BACKUP_FILENAME=\"mik_ng_backup.dump\""
    echo "  $0"
    exit 1
}

# ---- Validate inputs ----
if [ -z "$DATABASE_URL" ]; then
    echo "Error: DATABASE_URL is not set"
    usage
fi

if [ -z "$BACKUP_FILENAME" ]; then
    echo "Error: BACKUP_FILENAME is not set"
    usage
fi

if [ ! -f "$BACKUP_FILENAME" ]; then
    echo "Error: Backup file '$BACKUP_FILENAME' not found"
    exit 1
fi

# ---- Parse DATABASE_URL ----
# Expected format: postgresql://user:password@host:port/dbname
if [[ ! "$DATABASE_URL" =~ ^postgresql://([^:]+):([^@]+)@([^:]+):([0-9]+)/([^/]+)$ ]]; then
    echo "Error: DATABASE_URL format invalid. Expected: postgresql://user:pass@host:port/dbname"
    exit 1
fi

DB_USER="${BASH_REMATCH[1]}"
DB_PASS="${BASH_REMATCH[2]}"
DB_HOST="${BASH_REMATCH[3]}"
DB_PORT="${BASH_REMATCH[4]}"
DB_NAME="${BASH_REMATCH[5]}"

echo "Restoring database '$DB_NAME' on $DB_HOST:$DB_PORT from '$BACKUP_FILENAME' ..."

# ---- Export password for psql/pg_restore (avoids interactive prompt) ----
export PGPASSWORD="$DB_PASS"

# ---- Step 1: Drop the database if it exists (connect to 'postgres' maintenance db) ----
echo "Dropping database if it exists..."
dropdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" --if-exists "$DB_NAME"
if [ $? -ne 0 ]; then
    echo "Warning: dropdb failed (might be permission issue or no connections). Continuing..."
fi

# ---- Step 2: Create a fresh empty database ----
echo "Creating new database '$DB_NAME'..."
createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME"
if [ $? -ne 0 ]; then
    echo "Error: Failed to create database '$DB_NAME'"
    exit 1
fi

# ---- Step 3: Restore the dump using pg_restore ----
echo "Restoring data from backup file..."
pg_restore -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" \
    -d "$DB_NAME" \
    --verbose \
    --clean \
    --no-owner \
    --no-privileges \
    --if-exists \
    "$BACKUP_FILENAME"

if [ $? -eq 0 ]; then
    echo "Restore completed successfully!"
else
    echo "Error: Restore failed"
    exit 1
fi

# ---- Cleanup ----
unset PGPASSWORD