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
4. This will output a src/db/schema.d.ts file, commit the file along with other Flyway schemas to keep everything in sync
5. Run tests and fix all places not compatible with new schema anymore. Kysely will be bootstrapped with the generated DB model and intelli-sense / code-completion should work when writing kysely statements

# Scripts

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

# Deploying
