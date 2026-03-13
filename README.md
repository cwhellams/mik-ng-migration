```
 _____ ______       ___      ___  __            ________       ________
|\   _ \  _   \    |\  \    |\  \|\  \         |\   ___  \    |\   ____\
\ \  \\\__\ \  \   \ \  \   \ \  \/  /|_       \ \  \\ \  \   \ \  \___|
 \ \  \\|__| \  \   \ \  \   \ \   ___  \       \ \  \\ \  \   \ \  \  ___
  \ \  \    \ \  \   \ \  \   \ \  \\ \  \       \ \  \\ \  \   \ \  \|\  \
   \ \__\    \ \__\   \ \__\   \ \__\\ \__\       \ \__\\ \__\   \ \_______\
    \|__|     \|__|    \|__|    \|__| \|__|        \|__| \|__|    \|_______|

```

# Introduction

Welcome to the MIK ng "next gen" project

> Node : We are currently using Node v22.x.x

# Toolstack

1. Typescript
2. Node.js
3. Express
4. Vite / React
5. VS Code, Cursor (or your preferred IDE)
6. Postgres
7. Flyway (DB Migrations)
8. Docker
9. nvm (node version manager)
10. DBeaver (or your favourite SQL IDE)
11. pnpm

# Bootstrap you dev environment

Install Docker desktop (if you don't already have it) - this can be installed using a package manager or by downloading

nvm (node version manager) is recommended to manage your node install

## Mac

We assume you are using brew to manage installation packages

nvm is usually best installed on its own, check https://github.com/nvm-sh/nvm

    wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

then

    brew install flyway
    brew install --cask dbeaver-community
    brew install pnpm

Some tools e.g. sqlfluff require python, we will not cover the installation for that here but the internet or an AI bot will help you with that

## Windows

coming soon...

## Docker

Docker makes it easy to run the Postgres database, simply pull the container from docker

    docker pull postgres

## nvm

The node version manager is often used to manage various node versions, other tools such as pnpm can also be used or you can simply install locally.

Generally we will use the latest LTS version of Node - exceptions can be made if there is an obvious reason, but please try to keep to the LTS releases.

# Database

We are using postgres as our database , schema evolution is managed using a CLI tool called [Flyway](https://www.red-gate.com/products/flyway/community/). Flyway is very simple to use and provides an extremely robust way to manage database migrations, it also allows the database DDL schema definition code to be kept safely under version control.

## Getting started

Ensure you have docker running on your local machine then

    docker pull postgres

Once you have the postgres container downloaded you can use the start script to launch postgres with everything pre-configured

    ./scripts/start_postgres.sh

Load data required by tests

    ./scripts/baseline_database.sh

Or load minimal data to setup new TEST/PROD environments

    ./scripts/minimal_database.sh

## sql directory

Database related code should be stored in the ./sql folder

# Environments

We have defined 3 environments in GitHub

- DEV
- TEST
- PROD

## Environment variables and secrets

Env vars and secrets are stored in GitHub. We use Environment and Repository secrets.

## Local dev using dotenv

To make things easier for local development we use the dotenv library and a .env file, this allows all necessary env vars and secrets to be placed in the .env file when doing local development.

> DO NOT PLACE ANY SECRETS INTO THE .env file AND PUSH TO REMOTE !

No secrets should be pushed to the .env file and stored under version control ! Keep a copy of your .env file on local or overwrite the .env file with needed values when you start a piece of work.

.gitignore is configured to exclude .env files just in case !

## Github secrets cannot be seen once set

Oncce a secret is set in GitHub you cannot view the secret value, neither in the web ui or using the gh cli . Secrets are only available to GitHub actions.

# Production Releases

Production deployments are automated through Git tags using semantic versioning. See [RELEASE.md](./RELEASE.md) for detailed instructions on:

- Creating and pushing release tags
- Manual approval workflow
- Tag format requirements (vX.Y.Z)
- Rollback procedures
- Branch protection recommendations

Quick release commands:

```bash
pnpm version:patch  # Bug fixes (v1.0.0 -> v1.0.1)
pnpm version:minor  # New features (v1.0.0 -> v1.1.0)
pnpm version:major  # Breaking changes (v1.0.0 -> v2.0.0)
git push --tags
```

# Running the stack

> Note - make sure you have pre-reqs installed, Postgress running and bootstrapped with schema and data

From the root folder

    pnpm run dev

This will start the front end and backend, you will see output to the console which will give you a link to the frontend, the backend should start on port 3000 and everything should "just work".

### Steps to use :

1. Click login, use an email address from the test data
2. Click login with Email
3. In the console you will see a URL logged with the verification login link, you can use this to login (once email is working you can add your own details to test data and use those)
4. Clicking the link should auto login and you will see the Members list

## Mocking Simplbooks with Prism

Run the Simplbooks OpenAPI mock server with Stoplight Prism:

```bash
pnpm mock:simplbooks
```

This command serves the Simplbooks API mock from:

- OpenAPI source URL: `https://app.simplbooks.com/api-documentation/oas/api.yaml`
- Local spec file: `simplbooks/simplbooks-api/api.yaml`
- Host: `127.0.0.1`
- Port: `4010`

The mock includes a local path-rewrite proxy, so tenant routes like:

- `/{SIMPLBOOKS_COMPANY_ID}/api/articles/list`

are forwarded to Prism as:

- `/articles/list`

The proxy also enforces a Simplbooks-like global rate limit of `1 request/second`.
If exceeded, it returns HTTP `429` with a `Retry-After` header.

The backend default `.env` already points `SIMPLBOOKS_BASE_URI` to `http://127.0.0.1:4010`.
