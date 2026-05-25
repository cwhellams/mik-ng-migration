#!/bin/bash
set -e

# Check required environment variables
if [ -z "$DO_POSTGRES_PRIVATE_URL" ] || [ -z "$DO_POSTGRES_USER" ] || [ -z "$DO_POSTGRES_PASSWORD" ]; then
    echo "Error: Database credentials are missing (DO_POSTGRES_PRIVATE_URL, DO_POSTGRES_USER, DO_POSTGRES_PASSWORD)."
    exit 1
fi

if [ -z "$CLOUDFLARE_R2_ACCESSKEY_ID" ] || [ -z "$CLOUDFLARE_R2_SECRET_ACCESSKEY" ] || [ -z "$CLOUDFLARE_R2_EU_ENDPOINT" ] || [ -z "$CLOUDFLARE_R2_BUCKET_NAME_DB_BACKUP" ]; then
    echo "Error: R2 credentials are missing."
    exit 1
fi

if [ -z "$BACKUP_ENCRYPTION_PASSWORD" ]; then
    echo "Error: Backup encryption password is missing."
    exit 1
fi

# Extract host, port, and database from the URL
# Assuming DO_POSTGRES_PRIVATE_URL format is like: hostname:port/dbname or similar logic from original workflow
PGHOST=$(echo $DO_POSTGRES_PRIVATE_URL | sed -E 's#^([^:/]+)(:[0-9]+)?/.*$#\1#')
PGDATABASE=$(echo $DO_POSTGRES_PRIVATE_URL | sed -E 's#.*/##')

export PGPASSWORD="$DO_POSTGRES_PASSWORD"
export PGPORT="${DO_POSTGRES_PORT:-25060}"

echo "Using database port: $PGPORT"

TIMESTAMP=$(date +'%Y-%m-%d-%H%M%S')
BACKUP_FILENAME="backup-${TIMESTAMP}.dump"
ENCRYPTED_FILENAME="${BACKUP_FILENAME}.enc"

echo "Starting backup for database $PGDATABASE at $PGHOST:$PGPORT... to $BACKUP_FILENAME"

# Dump the database
pg_dump -h "$PGHOST" -p "$PGPORT" -U "$DO_POSTGRES_USER" --no-owner --no-privileges --format=custom --file="$BACKUP_FILENAME" "$PGDATABASE"

echo "Backup completed. Encrypting..."

# Encrypt the backup
openssl enc -aes-256-cbc -salt -pbkdf2 -in "$BACKUP_FILENAME" -out "$ENCRYPTED_FILENAME" -pass pass:"$BACKUP_ENCRYPTION_PASSWORD"

echo "Encryption completed. Uploading to R2..."

# Configure AWS CLI for this command execution
export AWS_ACCESS_KEY_ID="$CLOUDFLARE_R2_ACCESSKEY_ID"
export AWS_SECRET_ACCESS_KEY="$CLOUDFLARE_R2_SECRET_ACCESSKEY"
export AWS_DEFAULT_REGION="auto"

# Upload
aws s3 cp "$ENCRYPTED_FILENAME" "s3://$CLOUDFLARE_R2_BUCKET_NAME_DB_BACKUP/$ENCRYPTED_FILENAME" --endpoint-url "$CLOUDFLARE_R2_EU_ENDPOINT"

echo "Upload completed successfully."

# Cleanup
rm "$BACKUP_FILENAME" "$ENCRYPTED_FILENAME"
