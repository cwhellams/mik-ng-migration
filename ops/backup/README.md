# Overview

This Dockerfile and shell scripts are used to backup our Postgres database to an "offsite" storage in CLoudflare R2.

## Deployment

Deployment is done via a github action in deploy-backup-job.yml and a DO app spec in .do/pg-backup-job.yaml.

We build the Docker file and upload to GitHub Container Registry (DO charges for more than 1 image). We then deploy the app to DO and give it credentials for the GHCR so that it can pull the image.

## DO App Job

The backup is run as a DO App "job" - which is a feature that allows a container to be scheduled on a cron tab. This is hopefully cost effective as we are only charged for the time the container is alive

## Config

Configuration mostly comes from Github secrets and variables

We have an R2 bucket to store the backups, this is defaulted to delete files older than 90 days, files less than 90 days old cannot be deleted.

# How to Restore a backup

Restoring a backup is quite straightforward - simply perform the same steps to create the backup in reverse i.e.

1. Download backup from Cloudflare
2. Un-encrypt the backup file - see `encrypt_decrypt.sh`
   this is a ready made bash script where you simply need to enter the filenames and encryption key (key is held in GH secrets and by key members of MIK Web team)
3. use `pg_restore` CLI tool to restore the backup to a postgres db server - there is a bash script to help with this

   ```
   restore_db_backup.sh
   ```
