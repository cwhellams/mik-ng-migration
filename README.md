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

# Toolstack
1. Typescript
2. Node.js
3. Express
4. Next.js (UX)
5. VS Code, Cursor (or your preferred IDE)
6. Postgres
7. Flyway (DB Migrations)
8. Docker
9. nvm (node version manager)
10. DBeaver (or your favourite SQL IDE)
11. sqlfluff (Linter for SQL)
12. GitHub CLI

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
    brew install sqlfluff
    brew install gh

Some tools e.g. sqlfluff require python, we will not cover the installation for that here but the internet or an AI bot will help you with that

## Windows

coming soon...

## Docker
Docker makes it easy to run the Postgres database, simply pull the container from docker

    docker pull postgres

## nvm
 Install node , version TBD

# Database
We are using postgres as our database , schema evolution is managed using a CLI tool called [Flyway](https://www.red-gate.com/products/flyway/community/). Flyway is very simple to use and provides an extremely robust way to manage database migrations, it also allows the database DDL schema definition code to be kept safely under version control.

## Getting started
Ensure you have docker running on your local machine then 

    docker pull postgres

Once you have the postgres container downloaded you can use the start script to launch postgres with everything pre-configured

    ./scripts/start_postgres.sh

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

>  DO NOT PLACE ANY SECRETS INTO THE .env file AND PUSH TO REMOTE ! 

No secrets should be pushed to the .env file and stored under version control ! Keep a copy of your .env file on local or overwrite the .env file with needed values when you start a piece of work. 

## Github secrets cannot be seen once set
Oncce a secret is set in GitHub you cannot view the secret value, neither in the web ui or using the gh cli . Secrets are only available to GitHub actions.

