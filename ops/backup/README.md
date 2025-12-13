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