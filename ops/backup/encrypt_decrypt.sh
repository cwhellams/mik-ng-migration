#!/bin/bash

# =============================================================================
# OpenSSL AES-256-CBC Encryption/Decryption Script
# =============================================================================
# Usage:
#   1. Edit the variables below OR export them in your shell:
#        export BACKUP_FILENAME="myfile.txt"
#        export ENCRYPTED_FILENAME="myfile.txt.enc"
#        export BACKUP_ENCRYPTION_PASSWORD="your_strong_password_here"
#
#   2. Run the script:
#        ./encrypt_decrypt.sh encrypt    # to encrypt
#        ./encrypt_decrypt.sh decrypt    # to decrypt
#
#   If any required variable is missing, the script will show an error and exit.
# =============================================================================

# ---- Configurable variables (you can also set these as environment variables) ----
: "${BACKUP_FILENAME:=backup-2025-12-27-230024.dump}"                  # Plain file to encrypt / result after decrypt
: "${ENCRYPTED_FILENAME:=backup-2025-12-27-230024.dump.enc}"                # Encrypted file
: "${BACKUP_ENCRYPTION_PASSWORD:=dz6:X61gKJGf4F#1£f}"        # Password (keep it strong and secret!)

# ---- Helper: print usage ----
usage() {
    echo "Usage: $0 {encrypt|decrypt}"
    echo ""
    echo "Required environment variables (set them before running or edit the script):"
    echo "  BACKUP_FILENAME            - input file (plain) / output file (decrypted)"
    echo "  ENCRYPTED_FILENAME         - output file (encrypted) / input file (decrypt)"
    echo "  BACKUP_ENCRYPTION_PASSWORD - the encryption password"
    echo ""
    echo "Example:"
    echo "  export BACKUP_FILENAME=\"data.txt\""
    echo "  export ENCRYPTED_FILENAME=\"data.txt.enc\""
    echo "  export BACKUP_ENCRYPTION_PASSWORD=\"SuperSecret123!\""
    echo "  $0 encrypt"
    exit 1
}

# ---- Check arguments ----
if [ $# -ne 1 ]; then
    usage
fi

ACTION="$1"

if [[ "$ACTION" != "encrypt" && "$ACTION" != "decrypt" ]]; then
    echo "Error: Action must be 'encrypt' or 'decrypt'"
    usage
fi

# ---- Validate required variables ----
if [ -z "$BACKUP_FILENAME" ]; then
    echo "Error: BACKUP_FILENAME is not set"
    exit 1
fi

if [ -z "$ENCRYPTED_FILENAME" ]; then
    echo "Error: ENCRYPTED_FILENAME is not set"
    exit 1
fi

if [ -z "$BACKUP_ENCRYPTION_PASSWORD" ]; then
    echo "Error: BACKUP_ENCRYPTION_PASSWORD is not set"
    exit 1
fi

# ---- Perform the action ----
if [[ "$ACTION" == "encrypt" ]]; then
    echo "Encrypting '$BACKUP_FILENAME' → '$ENCRYPTED_FILENAME' ..."
    openssl enc -aes-256-cbc -salt -pbkdf2 \
        -in "$BACKUP_FILENAME" \
        -out "$ENCRYPTED_FILENAME" \
        -pass pass:"$BACKUP_ENCRYPTION_PASSWORD"

    if [ $? -eq 0 ]; then
        echo "Encryption successful: $ENCRYPTED_FILENAME"
    else
        echo "Encryption failed"
        exit 1
    fi

elif [[ "$ACTION" == "decrypt" ]]; then
    echo "Decrypting '$ENCRYPTED_FILENAME' → '$BACKUP_FILENAME' ..."
    openssl enc -aes-256-cbc -d -salt -pbkdf2 \
        -in "$ENCRYPTED_FILENAME" \
        -out "$BACKUP_FILENAME" \
        -pass pass:"$BACKUP_ENCRYPTION_PASSWORD"

    if [ $? -eq 0 ]; then
        echo "Decryption successful: $BACKUP_FILENAME"
    else
        echo "Decryption failed (wrong password or corrupted file?)"
        exit 1
    fi
fi