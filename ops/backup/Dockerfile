FROM alpine:3.22

# Install dependencies
# postgresql17-client: for pg_dump
# aws-cli: for uploading to R2
# openssl: for encryption
# bash: for the backup script
RUN apk add --no-cache \
    postgresql17-client \
    openssl \
    aws-cli \
    bash

# Create a directory for backups
WORKDIR /backup

# Copy the backup script
COPY backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh

# Set the entrypoint
CMD ["/usr/local/bin/backup.sh"]
