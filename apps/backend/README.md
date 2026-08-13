```
 _____ ______       ___      ___  __            ________       ________
|\   _ \  _   \    |\  \    |\  \|\  \         |\   ___  \    |\   ____\
\ \  \\\__\ \  \   \ \  \   \ \  \/  /|_       \ \  \\ \  \   \ \  \___|
 \ \  \\|__| \  \   \ \  \   \ \   ___  \       \ \  \\ \  \   \ \  \  ___
  \ \  \    \ \  \   \ \  \   \ \  \\ \  \       \ \  \\ \  \   \ \  \|\  \
   \ \__\    \ \__\   \ \__\   \ \__\\ \__\       \ \__\\ \__\   \ \_______\
    \|__|     \|__|    \|__|    \|__| \|__|        \|__| \|__|    \|_______|

```

The Backend......

# Overview

This is the backend project , mostly a node + express REST API

# Getting started

From the backend folder

    pnpm install

This will get you all the required packages.

## Run the DB codegen

We are using the [Kysely](https://kysely.dev/) micro-orm as our data layer. This seems to play nice with Typescript and provides an elegant abstraction over the raw db , whilst still being 'close to the metal'. It is quite well documented and reasonably popular.

Kysely requires the DB schema to be mapped to code, which is a rather tedious chore. Luckily there's a tool for that [kysely-codegen](https://github.com/RobinBlomberg/kysely-codegen).

Every time the DB schema is modified you have to rerun code generation to keep our mappings up to date with actual DB. This is quite easy :

1. Ensure you have the Postgres up and running using the latest scripts in ./sql
2. The default .env file should already contain a DATABASE_URL entry which matches the settings from the start script
3. Run codegen `pnpm schema`
4. This outputs **two** files — `src/db/schema.d.ts` (snake_case) and `src/db/schema.camel.d.ts` (camelCase) — because the data layer currently has two Kysely instances while the phase 5 migration is in progress (issue #1115; see `src/db/DATA_LAYER.md`). **Commit both**, along with the Flyway schemas, to keep everything in sync. Committing only `schema.d.ts` leaves the camelCase types stale, and the domains already migrated to `camelDb` will typecheck against a schema that no longer matches the database.
5. Run tests and fix all places not compatible with new schema anymore. Kysely will be bootstrapped with the generated DB model and intelli-sense / code-completion should work when writing kysely statements

# Scripts

## Environment variables

For QR code generation with logo overlay, set:

- `MIK_LOGO_PATH=/home/node/app/apps/backend/src/assets/mik-logo-blue.png` (container deployment default)

If not set, the backend will try known fallback paths and return a QR code without logo when no logo file is available.

## Prettier

To format code using prettier

    pnpm format

## Test

To run the Jest tests

    pnpm test

## Start the service

    pnpm start

or

    pnpm dev

# Testing the Docker image

in scrpts/ there is a shell script which can be used to build and start the container

    test_docker_build.sh

# Database migration

Database migrations are handle by flyway - more details in the readme in `./sql`
